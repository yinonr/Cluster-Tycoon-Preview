// V10.6 Cluster Tetris: the integration puzzle at the bell (engine). Contract:
// docs/v106/TETRIS_CONTRACT.md; design, scoring and evidence: docs/v106/CLUSTER_TETRIS.md.
// Pure, deterministic (seeded from g.seed, g.q and the recipe; no Math.random, no clock) and
// JSON-serializable: the whole puzzle lives in g.arcade.tetris (integers, strings, booleans), is
// saved on every input and tick like the rest of the game, and a reload resumes it exactly.
//
// The rack is 6 columns wide. This round's mixed recipes become GPU modules (H100 = 2 cells,
// H200 = 3, B200 = 4). The generator cuts the rack into exactly those modules (a gravity-valid
// tiling) and deals them in an order that tiling can be built in, so a PERFECT rack is always
// possible. Modules fall from a 4-row loading bay; rows never clear: a full row powers up and
// stays lit; a module that would stick out of the rack bounces to the next bell.
// Online now = 40% + 60% × (module cells in powered rows ÷ all module cells).
import { pendingIntegration, GPUS } from './founder.js';
import { stream } from '../util.js';

export const TETRIS = Object.freeze({
  skip: .75,                 // the integration crew's fixed baseline (skip, before START)
  floor: .55,                // V10.15: what comes online however the rack is played (V10.14: .40)
  width: 6, bay: 4,          // rack columns; loading-bay rows above the rack
  size: Object.freeze({ H100: 2, H200: 3, B200: 4 }),   // cells per module: small, medium, large
  pieces: Object.freeze([6, 12]),                       // modules per puzzle
  seconds: 30,               // nominal; each puzzle: clamp(12 + 2 × modules, 22, 35)
  time: Object.freeze({ base: 12, perPiece: 2, min: 22, max: 35 }),
  gravity: 550,              // ms per row; a grounded module locks on the next gravity step
  score: Object.freeze({ module: 100, row: 250, perfect: 1000, second: 50 }),
});
const W = TETRIS.width, BAY = TETRIS.bay;
const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

// The modules to seat: every GPU of this round's mixed builds (status 'integrating').
export function puzzleBuilds(g) { return pendingIntegration(g).filter(b => b.status === 'integrating'); }
export function puzzleRecipe(g) {
  const r = {}; for (const b of puzzleBuilds(g)) for (const k of GPUS) if (b.recipe[k]) r[k] = (r[k] || 0) + b.recipe[k];
  return r;
}

// ---- Shapes -------------------------------------------------------------------------------------
// A shape is a list of [x, y] cells (y grows downward), normalized to its top-left and sorted.
const norm = cells => {
  let mx = Infinity, my = Infinity;
  for (const [x, y] of cells) { if (x < mx) mx = x; if (y < my) my = y; }
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
const rotCW = cells => { let h = 0; for (const c of cells) h = Math.max(h, c[1] + 1); return norm(cells.map(([x, y]) => [h - 1 - y, x])); };
export function rotated(cells, r = 0) { let c = norm(cells); for (let i = 0; i < ((r % 4) + 4) % 4; i++) c = rotCW(c); return c; }
export function dims(cells) { let w = 0, h = 0; for (const [x, y] of cells) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); } return [w, h]; }
const key = cells => cells.map(c => c.join(',')).join(';');
// S/Z tetrominoes are the least readable; the generator allows at most one per rack.
const skew = cells => { if (cells.length !== 4) return false; const [w, h] = dims(cells); if (w * h !== 6) return false;
  const counts = Array(w === 3 ? h : w).fill(0); for (const [x, y] of cells) counts[w === 3 ? y : x]++; return counts.every(n => n === 2); };

// ---- The puzzle's size: modules per GPU type, rack height, the switch -------------------------------
// About 6–12 modules whatever the recipe: one module per GPU up to 12 GPUs (at least six), then one
// module per 2, 3… GPUs. Types keep the recipe's proportions (largest remainder; each type ≥ 1).
export function moduleCounts(recipe) {
  const types = GPUS.filter(k => recipe?.[k] > 0), N = types.reduce((n, k) => n + recipe[k], 0);
  if (!N) return {};
  const [lo, hi] = TETRIS.pieces;
  const P = Math.max(types.length, N <= hi ? Math.max(lo, N) : Math.ceil(N / Math.ceil(N / hi)));
  const quota = Object.fromEntries(types.map(k => [k, recipe[k] * P / N]));
  const counts = Object.fromEntries(types.map(k => [k, Math.max(1, Math.floor(quota[k]))]));
  const order = [...types].sort((a, b) => (quota[b] - Math.floor(quota[b])) - (quota[a] - Math.floor(quota[a])) || recipe[b] - recipe[a] || GPUS.indexOf(a) - GPUS.indexOf(b));
  let left = P - types.reduce((n, k) => n + counts[k], 0);
  for (let i = 0; left > 0; i++, left--) counts[order[i % order.length]]++;
  while (left < 0) { const k = [...types].sort((a, b) => counts[b] - counts[a])[0]; if (counts[k] <= 1) break; counts[k]--; left++; }
  return counts;
}
// The rack: 6 wide, as tall as the modules need. When their area is not a multiple of 6, the
// network switch (pre-installed, grey) fills the rest of the bottom row.
export function rackLayout(recipe) {
  const counts = moduleCounts(recipe), area = Object.entries(counts).reduce((n, [k, c]) => n + c * TETRIS.size[k], 0);
  const sw = (W - area % W) % W;
  return { counts, area, sw, h: (area + sw) / W, pieces: Object.values(counts).reduce((n, c) => n + c, 0) };
}
export const puzzleSeconds = pieces => Math.max(TETRIS.time.min, Math.min(TETRIS.time.max, TETRIS.time.base + TETRIS.time.perPiece * pieces));
const recipeKey = recipe => GPUS.filter(k => recipe[k] > 0).map(k => `${k}x${recipe[k]}`).join('+');

// ---- The generator: a gravity-valid tiling of the rack, dealt in a buildable order ----------------
// Pieces grow from the lowest-leftmost empty cell; a tiling is kept only if "lies above" between
// modules has no cycle (then any topological order can be dropped straight down, and every
// intermediate rack is a hole-free skyline). Returns the dealt pieces (spawn orientation, flattest)
// and the solution: per piece the rotation from spawn, the column and the row it lands in.
export function generatePuzzle(seed, q, recipe) {
  const L = rackLayout(recipe), H = L.h, types = [];
  for (const k of GPUS) for (let i = 0; i < (L.counts[k] || 0); i++) types.push(k);
  const rk = recipeKey(recipe);
  for (let attempt = 0; attempt < 4000; attempt++) {
    const r = stream(seed, 'v106-tetris', q, rk, attempt), tiling = tile(r, types, H, L.sw);
    if (!tiling) continue;
    const order = buildOrder(r, tiling.grid, tiling.pieces.length, H);
    if (!order) continue;
    const pieces = [], solution = [];
    for (const i of order) {
      const p = tiling.pieces[i], target = norm(p.cells.map(c => [c % W, Math.floor(c / W)]));
      let spawn = 0, best = -1;
      for (let s = 0; s < 4; s++) {
        const sh = rotated(target, s), [w, h] = dims(sh), flat = sh.filter(c => c[1] === h - 1).length;
        const score = (w >= h ? 100 : 0) + flat * 10 - s; // wide, flat side down, then the first
        if (score > best) { best = score; spawn = s; }
      }
      const cells = rotated(target, spawn), back = (4 - spawn) % 4, shape = rotated(cells, back);
      // The rotation from spawn the player needs, as the smallest r that gives the target shape.
      let rr = 0; while (key(rotated(cells, rr)) !== key(shape)) rr++;
      const xs = p.cells.map(c => c % W), ys = p.cells.map(c => Math.floor(c / W));
      pieces.push({ gpu: p.gpu, cells });
      solution.push({ r: rr, x: Math.min(...xs), y: BAY + Math.min(...ys) });
    }
    return { w: W, h: H, bay: BAY, sw: L.sw, swAt: tiling.swAt, counts: L.counts, pieces, solution, attempt };
  }
  throw Error(`Cluster Tetris: no tiling for ${rk}`);
}
function tile(r, types, H, sw) {
  const grid = new Array(W * H).fill(-1), swAt = sw ? r.int(0, W - sw) : 0;
  for (let i = 0; i < sw; i++) grid[(H - 1) * W + swAt + i] = -2;
  const order = r.shuffle(types), pieces = [];
  let skews = 0;
  for (let p = 0; p < order.length; p++) {
    let start = -1;
    for (let y = H - 1; y >= 0 && start < 0; y--) for (let x = 0; x < W; x++) if (grid[y * W + x] === -1) { start = y * W + x; break; }
    if (start < 0) return null;
    const k = TETRIS.size[order[p]];
    let cells = null;
    for (let tries = 0; tries < 6 && !cells; tries++) {
      const got = [start]; grid[start] = p;
      while (got.length < k) {
        const frontier = [];
        for (const c of got) for (const n of neighbours(c, H)) if (grid[n] === -1 && !frontier.includes(n)) frontier.push(n);
        if (!frontier.length) break;
        // Hug the structure: cells with more filled sides (or walls) are likelier, so the stack
        // stays flat and pockets are rare.
        const weights = frontier.map(n => 1 + 2 * (4 - neighbours(n, H).filter(m => grid[m] === -1).length) + (Math.floor(n / W) === Math.floor(start / W) ? 1 : 0));
        let u = r.next() * weights.reduce((a, b) => a + b, 0), pick = frontier[0];
        for (let i = 0; i < frontier.length; i++) { u -= weights[i]; if (u <= 0) { pick = frontier[i]; break; } }
        grid[pick] = p; got.push(pick);
      }
      const shape = norm(got.map(c => [c % W, Math.floor(c / W)]));
      if (got.length === k && !pocket(grid, H) && !(skew(shape) && skews >= 1)) { cells = got; if (skew(shape)) skews++; }
      else for (const c of got) grid[c] = -1;
    }
    if (!cells) return null;
    pieces.push({ gpu: order[p], cells });
  }
  return grid.includes(-1) ? null : { grid, pieces, swAt };
}
function neighbours(c, H) {
  const x = c % W, y = Math.floor(c / W), out = [];
  if (x > 0) out.push(c - 1); if (x < W - 1) out.push(c + 1); if (y > 0) out.push(c - W); if (y < H - 1) out.push(c + W);
  return out;
}
// An empty region smaller than the smallest module can never be filled.
function pocket(grid, H) {
  const seen = new Set();
  for (let c = 0; c < grid.length; c++) {
    if (grid[c] !== -1 || seen.has(c)) continue;
    let size = 0; const stack = [c]; seen.add(c);
    while (stack.length) { const n = stack.pop(); size++; for (const m of neighbours(n, H)) if (grid[m] === -1 && !seen.has(m)) { seen.add(m); stack.push(m); } }
    if (size < 2) return true;
  }
  return false;
}
// Module A must drop before module B when B lies above A in some column. A cycle (a module
// wrapped around another) means the tiling cannot be built with gravity: rejected.
function buildOrder(r, grid, n, H) {
  const after = Array.from({ length: n }, () => new Set()), indeg = new Array(n).fill(0);
  for (let x = 0; x < W; x++) for (let y = H - 1; y > 0; y--) {
    const lower = grid[y * W + x], upper = grid[(y - 1) * W + x];
    if (lower >= 0 && upper >= 0 && lower !== upper && !after[lower].has(upper)) { after[lower].add(upper); indeg[upper]++; }
  }
  const order = [], ready = [];
  for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
  while (ready.length) {
    const i = ready.splice(r.int(0, ready.length - 1), 1)[0]; order.push(i);
    for (const j of after[i]) if (!--indeg[j]) ready.push(j);
  }
  return order.length === n ? order : null;
}

// ---- Lifecycle ---------------------------------------------------------------------------------------
export function startPuzzle(g, spec = null) {
  if (g.phase !== 'integration') return false;
  const builds = spec ? spec.builds.map(id => ({id})) : puzzleBuilds(g), recipe = spec ? {...spec.recipe} : puzzleRecipe(g);
  if (!builds.length) return false;
  const P = generatePuzzle(spec?.seed ?? g.seed, g.q, recipe), rows = P.bay + P.h, cells = new Array(rows * W).fill(-1);
  for (let i = 0; i < P.sw; i++) cells[(rows - 1) * W + P.swAt + i] = -2;
  const seconds = puzzleSeconds(P.pieces.length);
  g.arcade.tetris = { id: spec?.id ?? `q${g.q}-tetris`, builds: builds.map(b => b.id), recipe, time: 0, seconds, done: false, result: null,
    w: W, h: P.h, bay: P.bay, rows, sw: P.sw, swAt: P.swAt, counts: P.counts, pieces: P.pieces, cells,
    started: false, at: 0, cur: null, ms: 0, fall: 0, placed: 0, powered: 0, locks: 0, moves: 0, drops: 0, out: [], last: null, jam: null, reason: null };
  return true;
}
const live = g => g?.phase === 'integration' && g.arcade?.tetris && !g.arcade.tetris.done;
export const puzzleOutcome = g => g.arcade?.tetris?.done ? g.arcade.tetris.result : null;
export const currentCells = t => t.cur ? rotated(t.pieces[t.at].cells, t.cur.r) : [];

function fits(t, cells, x, y) {
  for (const [cx, cy] of cells) {
    const X = x + cx, Y = y + cy;
    if (X < 0 || X >= t.w || Y < 0 || Y >= t.rows || t.cells[Y * t.w + X] !== -1) return false;
  }
  return true;
}
// Where the current module would land if dropped now (the ghost), as its top row.
export function landing(t) {
  if (!t?.cur) return null;
  const cells = currentCells(t); let y = t.cur.y;
  while (fits(t, cells, t.cur.x, y + 1)) y++;
  return y;
}
function spawn(t) {
  const cells = t.pieces[t.at].cells, [w] = dims(cells), cur = { x: Math.floor((t.w - w) / 2), y: 0, r: 0 };
  t.fall = 0;
  if (!fits(t, cells, cur.x, cur.y)) { t.jam = { i: t.at, ...cur }; t.cur = null; return finish(t, 'jam'); }
  t.cur = cur;
  return true;
}
function begin(t) { t.started = true; t.at = 0; return spawn(t); }

// A grounded module locks into the rack. A module that would stick out into the loading bay does
// not fit: it bounces (it waits for the next bell, like every unpowered module) and the next one
// comes. The puzzle ends when every module has been dealt, or at the time limit.
function lock(t) {
  const cells = currentCells(t), { x, y, r } = t.cur;
  t.locks++;
  if (cells.some(([, cy]) => y + cy < t.bay)) {
    t.out.push(t.at); t.last = { i: t.at, x, y, r, rows: [], bounced: true, n: t.locks };
  } else {
    for (const [cx, cy] of cells) t.cells[(y + cy) * t.w + x + cx] = t.at;
    t.placed++;
    const rows = [...new Set(cells.map(([, cy]) => y + cy))].filter(Y => rowFull(t, Y)).sort((a, b) => b - a);
    t.powered += rows.length;
    t.last = { i: t.at, x, y, r, rows, n: t.locks };
  }
  t.at++; t.cur = null;
  if (t.at >= t.pieces.length) return finish(t, 'complete');
  return spawn(t);
}
function rowFull(t, y) { for (let x = 0; x < t.w; x++) if (t.cells[y * t.w + x] === -1) return false; return true; }

// The transparent score: module cells in fully powered rows ÷ every module cell, mapped onto
// [floor, 1]. Two decimals; 1.00 only for a perfect rack (every row powered).
export function evaluate(t) {
  let rows = 0, powered = 0, total = 0;
  for (let y = t.bay; y < t.rows; y++) {
    let full = true, mods = t.w;
    for (let x = 0; x < t.w; x++) { const v = t.cells[y * t.w + x]; if (v === -1) full = false; if (v === -2) mods--; }
    total += mods; if (full) { rows++; powered += mods; }
  }
  const share = total ? powered / total : 0, perfect = rows === t.h;
  const efficiency = perfect ? 1 : Math.min(.99, Math.round((TETRIS.floor + (1 - TETRIS.floor) * share) * 100) / 100);
  return { rows, share, efficiency, perfect, poweredCells: powered, moduleCells: total };
}
function finish(t, reason) {
  const e = evaluate(t), S = TETRIS.score, left = Math.max(0, Math.floor((t.seconds * 1000 - t.ms) / 1000));
  t.done = true; t.cur = null; t.reason = reason; t.time = t.ms / 1000;
  t.result = { efficiency: e.efficiency, perfect: e.perfect, skipped: false, score: S.module * t.placed + S.row * e.rows + (e.perfect ? S.perfect + S.second * left : 0),
    rows: e.rows, placed: t.placed, pieces: t.pieces.length, bounced: t.out.length, height: t.h, reason, seconds: Math.round(t.ms / 100) / 10 };
  return true;
}

// ---- Inputs and time ---------------------------------------------------------------------------------
// left, right, rotate (clockwise, with small kicks), soft (one row; locks if grounded), drop
// (hard drop + lock), start. Returns false when nothing changed.
export function puzzleInput(g, action) {
  if (!live(g)) return false;
  const t = g.arcade.tetris;
  if (action === 'start') return t.started ? false : begin(t);
  if (!t.started || !t.cur) return false;
  const cells = currentCells(t), { x, y, r } = t.cur;
  if (action === 'left' || action === 'right') {
    const nx = x + (action === 'left' ? -1 : 1);
    if (!fits(t, cells, nx, y)) return false;
    t.cur.x = nx; t.moves++; return true;
  }
  if (action === 'rotate') {
    const next = rotated(t.pieces[t.at].cells, r + 1);
    if (key(next) === key(cells)) return false; // a square module looks the same every way round
    const [w, h] = dims(cells), [w2, h2] = dims(next), bx = x + Math.trunc((w - w2) / 2), by = Math.max(0, y + Math.trunc((h - h2) / 2));
    for (const [dx, dy] of KICKS) if (fits(t, next, bx + dx, by + dy)) { t.cur = { x: bx + dx, y: by + dy, r: (r + 1) % 4 }; t.moves++; return true; }
    return false;
  }
  if (action === 'soft') {
    t.moves++;
    if (fits(t, cells, x, y + 1)) { t.cur.y++; t.fall = 0; return true; }
    return lock(t);
  }
  if (action === 'drop') {
    while (fits(t, cells, t.cur.x, t.cur.y + 1)) t.cur.y++;
    t.drops++;
    return lock(t);
  }
  return false;
}
// Gravity and the puzzle's own clock (dt in seconds, at most 1 per call). The first tick starts
// an unstarted puzzle. At the time limit the puzzle ends with the rack as it stands.
export function puzzleTick(g, dt) {
  if (!live(g) || !(dt > 0)) return false;
  const t = g.arcade.tetris;
  let ms = Math.round(Math.min(dt, 1) * 1000);
  if (ms <= 0) return false;
  if (!t.started) begin(t);
  const limit = t.seconds * 1000;
  while (ms > 0 && !t.done) {
    const step = Math.min(ms, TETRIS.gravity - t.fall, limit - t.ms);
    t.ms += step; t.fall += step; ms -= step;
    if (t.ms >= limit) { finish(t, 'time'); break; }
    if (t.fall >= TETRIS.gravity && t.cur) {
      t.fall = 0;
      const cells = currentCells(t);
      if (fits(t, cells, t.cur.x, t.cur.y + 1)) t.cur.y++; else lock(t);
    }
  }
  t.time = t.ms / 1000;
  return true;
}
export const msToGravity = t => t?.cur ? TETRIS.gravity - t.fall : TETRIS.gravity;
// The integration crew's baseline: offered before START (once you play, you play it out, so the
// skip can never be used to bail out of a bad rack).
export function skipPuzzle(g) {
  if (!live(g) || g.arcade.tetris.started) return false;
  const t = g.arcade.tetris;
  t.done = true; t.cur = null; t.reason = 'skip';
  t.result = { efficiency: TETRIS.skip, perfect: false, skipped: true, score: 0, rows: 0, placed: 0, pieces: t.pieces.length, bounced: 0, height: t.h, reason: 'skip', seconds: 0 };
  return true;
}

// ---- Autoplay: the real puzzle, played through puzzleInput / puzzleTick ---------------------------
// Strategy bots and tests. Deterministic per (seed, round, skill). Each module: with a seeded
// chance a careless placement (more likely at low skill); else the perfect-rack plan (a
// depth-first search over hole-free placements, most likely at high skill); else a greedy
// heuristic. A seeded fumble slides the module one column. Think time is spent on the puzzle's
// clock while the module falls. Skill 1 plays the plan every time.
export const botMix = s => ({ pRandom: .6 * (1 - s) ** 2, pPlan: s * s, pFumble: .12 * (1 - s) ** 1.5, look: s >= .3, think: .35 + 1.3 * (1 - s) });
export function autoplay(g, skill = 1, mix = null) {
  if (!live(g)) return false;
  const t = g.arcade.tetris, s = Number.isFinite(Number(skill)) ? Math.max(0, Math.min(1, Number(skill))) : 1;
  const rng = stream(g.seed, 'v106-tetris-bot', g.q, Math.round(s * 1000), t.at, t.locks);
  const { pRandom, pPlan, pFumble, look, think } = { ...botMix(s), ...mix }; // mix: tests/sims only
  const rots = t.pieces.map(p => distinctRotations(p.cells));
  let plan = null; // the planner's remaining steps, valid while the bot follows them
  if (!t.started) puzzleInput(g, 'start');
  for (let guard = 0; !t.done && guard < 400; guard++) {
    if (!t.cur) break;
    const i = t.at, cands = placements(t, rots[i]);
    let pick = null;
    if (cands.length && rng.next() < pRandom) pick = cands[rng.int(0, cands.length - 1)];
    else if (cands.length && rng.next() < pPlan) {
      if (!plan || plan.at !== i) plan = solve(t, rots);
      const step = plan?.steps[0];
      pick = step ? cands.find(c => c.r === step.r && c.x === step.x) || null : null;
    }
    if (!pick && cands.length) pick = greedy(t, cands, rots, look);
    if (pick && rng.next() < pFumble) { const alt = cands.filter(c => c.r === pick.r && Math.abs(c.x - pick.x) === 1); if (alt.length) pick = alt[rng.int(0, alt.length - 1)]; }
    // The plan survives only if this module goes exactly where it says.
    const s0 = plan?.at === i ? plan.steps[0] : null;
    plan = s0 && pick && s0.r === pick.r && s0.x === pick.x ? { at: i + 1, steps: plan.steps.slice(1) } : null;
    if (pick) {
      for (let k = 0; k < 4 && t.cur && t.at === i && t.cur.r !== pick.r; k++) if (!puzzleInput(g, 'rotate')) break;
      while (t.cur && t.at === i && t.cur.x < pick.x && puzzleInput(g, 'right'));
      while (t.cur && t.at === i && t.cur.x > pick.x && puzzleInput(g, 'left'));
    }
    let wait = think * (.7 + .6 * rng.next());
    while (wait > 0 && !t.done && t.at === i) { const d = Math.min(1, wait); puzzleTick(g, d); wait -= d; }
    if (!t.done && t.at === i) puzzleInput(g, 'drop');
  }
  while (!t.done) puzzleTick(g, 1); // never reached in practice: the clock always ends a puzzle
  return true;
}
function distinctRotations(cells) {
  const out = [], seen = new Set();
  for (let r = 0; r < 4; r++) {
    const c = rotated(cells, r), k = key(c);
    if (seen.has(k)) continue; seen.add(k);
    const [w, h] = dims(c), bot = Array(w).fill(-1), top = Array(w).fill(99), cnt = Array(w).fill(0);
    for (const [x, y] of c) { bot[x] = Math.max(bot[x], y); top[x] = Math.min(top[x], y); cnt[x]++; }
    out.push({ r, cells: c, w, h, bot, top, cnt });
  }
  return out;
}
// Every straight drop of the current module from the loading bay: the rotations the bay allows,
// every column. (Rotations at spawn always fit: the bay is as tall as the tallest module.)
function placements(t, rots) {
  const out = [], y0 = t.cur.y;
  for (const R of rots) {
    if (R.r !== t.cur.r && t.cur.y !== 0) continue; // mid-fall, keep the orientation it has
    for (let x = 0; x + R.w <= t.w; x++) {
      let y = y0; if (!fits(t, R.cells, x, y)) continue;
      while (fits(t, R.cells, x, y + 1)) y++;
      out.push({ r: R.r, x, y, cells: R.cells });
    }
  }
  return out;
}
// Greedy: powered rows good; holes (empty slots under a module) and a ragged surface bad; a module
// left in the bay is a jam. With lookahead, the best reply of the next module counts too.
function rackOf(t) { const a = new Int8Array(t.h * t.w); for (let i = 0; i < a.length; i++) a[i] = t.cells[t.bay * t.w + i] === -1 ? 0 : 1; return a; }
function place(rack, t, cells, x, y) {
  const a = rack.slice();
  for (const [cx, cy] of cells) { const Y = y + cy - t.bay; if (Y < 0) return null; a[Y * t.w + x + cx] = 1; }
  return a;
}
// A covered empty slot can never be filled, so its row is lost: dead rows dominate the rating.
function rate(a, t) {
  const w = t.w, h = t.h, hts = new Array(w).fill(0), dead = new Array(h).fill(0);
  let holes = 0, rows = 0;
  for (let x = 0; x < w; x++) { let top = -1; for (let y = 0; y < h; y++) if (a[y * w + x]) { if (top < 0) top = y; } else if (top >= 0) { holes++; dead[y] = 1; } hts[x] = top < 0 ? 0 : h - top; }
  for (let y = 0; y < h; y++) { let full = true; for (let x = 0; x < w; x++) if (!a[y * w + x]) { full = false; break; } if (full) rows++; }
  let bump = 0, wells = 0;
  for (let x = 0; x < w; x++) {
    if (x < w - 1) bump += Math.abs(hts[x] - hts[x + 1]);
    const l = x ? hts[x - 1] : h, r = x < w - 1 ? hts[x + 1] : h, d = Math.min(l, r) - hts[x];
    if (d >= 2) wells += d - 1;
  }
  return 4 * rows - 60 * dead.reduce((n, v) => n + v, 0) - 8 * holes - 1.5 * bump - 3 * wells - .3 * Math.max(...hts);
}
function landOn(a, t, cells, x) {
  // Straight drop onto a rack array from above (rows above the rack are always free).
  let y = -4;
  const ok = yy => cells.every(([cx, cy]) => { const Y = yy + cy; return Y < t.h && (Y < 0 || !a[Y * t.w + x + cx]); });
  if (!ok(y)) return null;
  while (ok(y + 1)) y++;
  return y + t.bay;
}
function greedy(t, cands, rots, look) {
  const rack = rackOf(t), nextRots = rots[t.at + 1];
  let best = null, bestScore = -Infinity;
  for (const c of cands) {
    const a = place(rack, t, c.cells, c.x, c.y);
    let score = a ? rate(a, t) : -1e6;
    if (a && look && nextRots) {
      let reply = -1e6;
      for (const R of nextRots) for (let x = 0; x + R.w <= t.w; x++) {
        const y = landOn(a, t, R.cells, x); if (y === null) continue;
        const b = place(a, t, R.cells, x, y); if (b) reply = Math.max(reply, rate(b, t));
      }
      score = .5 * score + .5 * reply;
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}
// The perfect-rack planner: depth-first over hole-free straight drops on the skyline, with a memo
// of dead ends and a node budget. Returns { at, steps: [{r, x}…] } from the current module to the
// last, or null (no perfect rack left from here, or the budget ran out).
export function solve(t, rots = t.pieces.map(p => distinctRotations(p.cells)), budget = 6000) {
  const h = t.h, w = t.w, hts = new Array(w).fill(0);
  for (let x = 0; x < w; x++) {
    let top = -1;
    for (let y = 0; y < h; y++) { const v = t.cells[(t.bay + y) * w + x] !== -1; if (v && top < 0) top = y; if (!v && top >= 0) return null; }
    hts[x] = top < 0 ? 0 : h - top;
  }
  const dead = new Set(); let nodes = 0;
  function dfs(i) {
    if (i >= t.pieces.length) return hts.every(v => v === h) ? [] : null;
    const k = i + ':' + hts.join('');
    if (dead.has(k) || ++nodes > budget) return null;
    const moves = [];
    for (const R of rots[i]) for (let x = 0; x + R.w <= w; x++) {
      let Y = Infinity;
      for (let c = 0; c < R.w; c++) Y = Math.min(Y, h - 1 - hts[x + c] - R.bot[c]);
      if (Y < 0) continue;
      let flush = true;
      for (let c = 0; c < R.w && flush; c++) if (Y + R.bot[c] !== h - 1 - hts[x + c] || R.cnt[c] !== R.bot[c] - R.top[c] + 1) flush = false;
      if (!flush) continue;
      let lo = Infinity; for (let c = 0; c < R.w; c++) lo = Math.min(lo, hts[x + c]);
      moves.push({ r: R.r, x, R, lo });
    }
    moves.sort((a, b) => a.lo - b.lo || a.x - b.x || a.r - b.r);
    for (const m of moves) {
      for (let c = 0; c < m.R.w; c++) hts[m.x + c] += m.R.cnt[c];
      const rest = dfs(i + 1);
      for (let c = 0; c < m.R.w; c++) hts[m.x + c] -= m.R.cnt[c];
      if (rest) return [{ r: m.r, x: m.x }, ...rest];
      if (nodes > budget) return null;
    }
    dead.add(k);
    return null;
  }
  const steps = dfs(t.at);
  return steps ? { at: t.at, steps } : null;
}
