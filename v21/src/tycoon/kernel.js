// V20 Kernel Snake: operate compute (engine). Contract: docs/V10_19_INTEGRATION_CONTRACT.md.
// An arcade metaphor for keeping a large fleet productive. The board is the fleet: a 12 × 12 grid of GPUs (bands in
// the deployment's H100/H200/B200 mix). The player steers the workload stream; kernels (jobs) wait on idle GPUs, and
// running the stream over one schedules it: the stream grows, the GPU lights up busy, the next job appears. Every few
// jobs a GPU throttles (a hot tile). Running into the fleet's edge, the stream itself or a hot GPU is a stall: the run
// ends. The stream speeds up as the workload grows. Perfect = every scheduled kernel run without a stall.
// Efficiency = 0.55 + 0.45 × kernels run ÷ kernels scheduled (1.00 only for a perfect run).
// Pure, deterministic (stream(seed, 'v119-kernel', …), no Math.random, no clock) and JSON state in g.arcade.kernel.
import { stream } from '../util.js';
import { GPUS } from './founder.js';
import { gameLaunchAllowed, gameSessionAllowed, minigameRound } from './replay-access.js';

export const KERNEL = Object.freeze({
  w: 12, h: 12, length: 3,
  move: Object.freeze({ base: 240, per: 7, min: 150 }),     // ms per move: faster as the workload grows (never past 150)
  target: Object.freeze({ base: 16, per: 128, max: 21 }),   // kernels scheduled: 16 at 256 GPUs, +1 per 128 more
  time: Object.freeze({ base: 14, perKernel: 2.3, min: 34, max: 52 }),
  jobs: 2,                                                  // kernels waiting at once
  hotEvery: 3,                                              // a GPU throttles after every third kernel
  score: Object.freeze({ kernel: 100, perfect: 1000, second: 50 }),
  skip: .75, floor: .55,
});
const W = KERNEL.w, H = KERNEL.h;
const DIR = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });
const BACK = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });
const xy = i => [i % W, Math.floor(i / W)];
const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : y * W + x;
export const stepFrom = (i, d, w = W, h = H) => {
  const [dx, dy]=DIR[d], x=i%w+dx, y=Math.floor(i/w)+dy;
  return x<0 || y<0 || x>=w || y>=h ? -1 : y*w+x;
};
const recipeKey = r => GPUS.filter(k => r?.[k] > 0).map(k => `${k}x${r[k]}`).join('+');
export const targetFor = scale => Math.max(KERNEL.target.base, Math.min(KERNEL.target.max, KERNEL.target.base + Math.floor((Math.max(256, scale) - 256) / KERNEL.target.per)));
export const timeFor = n => Math.max(KERNEL.time.min, Math.min(KERNEL.time.max, Math.round(KERNEL.time.base + KERNEL.time.perKernel * n)));
export const moveMs = t => Math.max(KERNEL.move.min, KERNEL.move.base - KERNEL.move.per * t.ran);

// The fleet: horizontal bands of GPU types in the recipe's proportions (each type at least one band of rows).
function fleetLayout(recipe) {
  const types = GPUS.filter(k => recipe?.[k] > 0), total = types.reduce((s, k) => s + recipe[k], 0) || 1;
  const rows = []; let left = H;
  types.forEach((k, j) => { const n = j === types.length - 1 ? left : Math.max(1, Math.min(left - (types.length - 1 - j), Math.round(H * recipe[k] / total))); for (let r = 0; r < n; r++) rows.push(k); left -= n; });
  if (!rows.length) for (let r = 0; r < H; r++) rows.push('H100');
  return Array.from({ length: W * H }, (_, i) => rows[Math.floor(i / W)]);
}

// ---- Lifecycle --------------------------------------------------------------------------------------------------
export function startKernel(g, spec) {
  if (!gameLaunchAllowed(g,'kernel',spec?.training===true) || !spec?.builds?.length) return false;
  if (spec.training) {
    const w=6,h=5,target=spec.target===4?4:2,jobs=target===4?[14,16,28,25]:[14,16];
    g.arcade.kernel={id:spec.id || 'practice-kernel',builds:[...spec.builds],recipe:{...spec.recipe},w,h,
      gpus:Array(w*h).fill('H100'),rk:recipeKey(spec.recipe),training:true,
      snake:[20,26],dir:'up',turns:[],jobs:jobs.map((i,n)=>({i,gpu:'H100',n:n+1})),hot:[],busy:Array(w*h).fill(0),
      target,ran:0,spawns:target,ms:0,acc:0,seconds:0,started:false,done:false,result:null,reason:null,crash:null,last:null};
    return true;
  }
  const target = targetFor(spec.scale || 256), x0 = Math.floor(W / 2);
  const t = {
    id: `q${minigameRound(g)}-kernel`, builds: [...spec.builds], recipe: { ...spec.recipe }, w: W, h: H, gpus: fleetLayout(spec.recipe), rk: recipeKey(spec.recipe),
    snake: [at(x0, H - 3), at(x0, H - 2), at(x0, H - 1)], dir: 'up', turns: [], jobs: [], hot: [], busy: Array(W * H).fill(0),
    target, ran: 0, spawns: 0, ms: 0, acc: 0, seconds: timeFor(target), started: false, done: false, result: null, reason: null, crash: null, last: null,
  };
  for (let k = 0; k < KERNEL.jobs; k++) spawnJob(g.seed, minigameRound(g), t);
  g.arcade.kernel = t;
  return true;
}
const state = g => g?.arcade?.kernel;
const live = g => gameSessionAllowed(g,'kernel') && !state(g).done;
export const kernelOutcome = g => state(g)?.done ? state(g).result : null;
const occupied = (t, i) => t.snake.includes(i) || t.hot.includes(i) || t.jobs.some(j => j.i === i);
// A tile the stream can enter and leave again: at least two neighbours that are neither the edge nor throttled.
const openSides = (t, i, hot = t.hot) => Object.keys(DIR).filter(d => { const n = stepFrom(i, d, t.w, t.h); return n >= 0 && !hot.includes(n); }).length;
// A job appears on an idle GPU away from the head, never in a dead end (seeded by its sequence number, so a reload
// deals the same jobs).
function spawnJob(seed, q, t) {
  const r = stream(seed, 'v119-kernel', q, t.rk, t.spawns++), head = t.snake[0], [hx, hy] = xy(head);
  const free = []; for (let i = 0; i < W * H; i++) { const [x, y] = xy(i); if (!occupied(t, i) && Math.abs(x - hx) + Math.abs(y - hy) >= 3 && openSides(t, i) >= 2) free.push(i); }
  if (!free.length) return false;
  const i = free[r.int(0, free.length - 1)];
  t.jobs.push({ i, gpu: t.gpus[i], n: t.spawns });
  return true;
}
// A GPU throttles away from the head, and never where it would leave a waiting job in a dead end.
function spawnHot(seed, q, t) {
  const r = stream(seed, 'v119-kernel-hot', q, t.rk, t.hot.length), head = t.snake[0], [hx, hy] = xy(head);
  const traps = i => t.jobs.some(j => openSides(t, j.i, [...t.hot, i]) < 2);
  const free = []; for (let i = 0; i < W * H; i++) { const [x, y] = xy(i); if (!occupied(t, i) && Math.abs(x - hx) + Math.abs(y - hy) >= 4 && !traps(i)) free.push(i); }
  if (free.length) t.hot.push(free[r.int(0, free.length - 1)]);
}
// One move: the queued turn (never a reversal), then the head steps. A job grows the stream; a wall, the stream's
// body or a hot GPU stalls it. The tail cell is free to enter (it moves away this step) unless the stream grows.
function move(seed, q, t) {
  while (t.turns.length) { const d = t.turns.shift(); if (d !== t.dir && d !== BACK[t.dir]) { t.dir = d; break; } }
  const head = t.snake[0], next = stepFrom(head, t.dir, t.w, t.h), job = t.jobs.find(j => j.i === next);
  const body = job ? t.snake : t.snake.slice(0, -1);
  if (next < 0 || body.includes(next) || t.hot.includes(next)) {
    t.crash = { i: next < 0 ? head : next, why: next < 0 ? 'edge' : t.hot.includes(next) ? 'hot' : 'self' };
    return finish(t, 'stall');
  }
  t.snake.unshift(next);
  if (job) {
    t.jobs = t.jobs.filter(j => j !== job); t.busy[next] = 1; t.ran++; t.last = { i: next, n: t.ran };
    if (t.ran >= t.target) return finish(t, 'complete');
    if (t.training) return true; // The representative practice jobs are already visible.
    if (t.ran % KERNEL.hotEvery === 0) spawnHot(seed, q, t);
    spawnJob(seed, q, t);
  } else t.snake.pop();
  return true;
}
export function evaluateKernel(t) {
  const share = t.target ? Math.min(1, t.ran / t.target) : 0, perfect = t.ran >= t.target;
  const efficiency = perfect ? 1 : Math.min(.99, Math.round((KERNEL.floor + (1 - KERNEL.floor) * share) * 100) / 100);
  return { share, efficiency, perfect };
}
function finish(t, reason) {
  const e = evaluateKernel(t), S = KERNEL.score, left = Math.max(0, Math.floor((t.seconds * 1000 - t.ms) / 1000));
  t.done = true; t.reason = reason;
  t.result = { efficiency: e.efficiency, perfect: e.perfect, skipped: false, reason, seconds: Math.round(t.ms / 100) / 10,
    score: S.kernel * t.ran + (e.perfect ? S.perfect + S.second * left : 0), rows: null, placed: t.ran, pieces: t.target,
    detail: { kernels: t.ran, target: t.target, length: t.snake.length, hot: t.hot.length, crash: t.crash?.why || null } };
  return true;
}

// ---- Inputs and time --------------------------------------------------------------------------------------------
// start; turn (arg: 'up'|'down'|'left'|'right'; up to two turns are buffered between moves).
export function kernelInput(g, action, arg) {
  if (!live(g)) return false;
  const t = state(g);
  if (action === 'start') { if (t.started) return false; t.started = true; return true; }
  if (!t.started || action !== 'turn' || !DIR[arg]) return false;
  if (t.training) {
    // Deliberate moves teach steering without a moving clock. Repeating the
    // current direction advances one cell; reversing into the body still fails.
    if (arg===BACK[t.dir]) return false;
    if (arg!==t.dir) t.turns.push(arg);
    return move(g.seed,minigameRound(g),t);
  }
  const last = t.turns.at(-1) || t.dir;
  if (arg === last || arg === BACK[last] || t.turns.length >= 2) return false;
  t.turns.push(arg); return true;
}
export function kernelTick(g, dt) {
  if (!live(g) || !(dt > 0)) return false;
  const t = state(g);
  if (t.training) return false;
  if (!t.started) t.started = true;
  let ms = Math.round(Math.min(dt, 1) * 1000);
  const limit = t.seconds * 1000;
  while (ms > 0 && !t.done) {
    const per = moveMs(t), step = Math.min(ms, per - t.acc, limit - t.ms);
    t.ms += step; t.acc += step; ms -= step;
    if (t.ms >= limit) { finish(t, 'time'); break; }
    if (t.acc >= per) { t.acc = 0; move(g.seed, minigameRound(g), t); }
  }
  return true;
}
export const msToMove = t => t ? moveMs(t) - t.acc : 1000;
export function skipKernel(g) {
  if (!live(g) || state(g).started) return false;
  const t = state(g);
  t.done = true; t.reason = 'skip';
  t.result = { efficiency: KERNEL.skip, perfect: false, skipped: true, score: 0, reason: 'skip', seconds: 0, rows: null, placed: 0, pieces: t.target, detail: { kernels: 0, target: t.target, length: t.snake.length, hot: 0, crash: null } };
  return true;
}

// ---- Autoplay: the real game through kernelInput / kernelTick ---------------------------------------------------------
// Each move: a shortest path to the nearest job that leaves the stream room to manoeuvre (flood fill, at higher
// skill); with a seeded chance (more likely at low skill) a hasty turn instead. Deterministic per (seed, round, skill).
export const kernelBotMix = s => ({ pHasty: .22 * (1 - s) ** 1.2, safe: s >= .45 });
function bfs(t, from, blocked) {
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) { const c = q.shift(); for (const d of Object.keys(DIR)) { const n = stepFrom(c, d, t.w, t.h); if (n < 0 || prev.has(n) || blocked.has(n)) continue; prev.set(n, [c, d]); q.push(n); } }
  return prev;
}
function room(t, from, blocked) { let n = 0; for (const _ of bfs(t, from, blocked).keys()) n++; return n; }
export function autoplayKernel(g, skill = 1, override = null) {
  if (!live(g)) return false;
  const t = state(g), s = Math.max(0, Math.min(1, Number.isFinite(Number(skill)) ? Number(skill) : 1)), mix = { ...kernelBotMix(s), ...override }; // override: calibration only
  kernelInput(g, 'start');
  for (let guard = 0; guard < 4000 && !t.done; guard++) {
    const rng = stream(g.seed, 'v119-kernel-bot', minigameRound(g), Math.round(s * 1000), t.ran, guard), head = t.snake[0];
    const blocked = new Set([...t.snake.slice(0, -1), ...t.hot]);
    const options = Object.keys(DIR).filter(d => d !== BACK[t.dir]).map(d => ({ d, n: stepFrom(head, d, t.w, t.h) })).filter(o => o.n >= 0 && !blocked.has(o.n));
    let pick = null;
    if (options.length && rng.chance(mix.pHasty)) pick = rng.pick(Object.keys(DIR).filter(d => d !== BACK[t.dir]));
    else if (options.length) {
      const prev = bfs(t, head, blocked);
      const jobs = t.jobs.filter(j => prev.has(j.i)).sort((a, b) => dist(prev, a.i) - dist(prev, b.i));
      const ok = o => !mix.safe || room(t, o.n, new Set([...blocked, head])) >= Math.min(t.snake.length + 2, 40);
      const firstStep = j => { let c = j.i; while (prev.get(c) && prev.get(c)[0] !== head) c = prev.get(c)[0]; return prev.get(c)?.[1] || null; };
      // The nearest job whose first step is safe (a careful player passes over a job it cannot reach safely yet).
      const toward = jobs.map(firstStep).map(d => options.find(o => o.d === d)).find(o => o && ok(o));
      const best = toward || options.filter(ok).sort((a, b) => room(t, b.n, new Set([...blocked, head])) - room(t, a.n, new Set([...blocked, head])))[0] || options[0];
      pick = best.d;
    }
    if (pick && (pick !== t.dir || t.training)) kernelInput(g, 'turn', pick);
    kernelTick(g, msToMove(t) / 1000 + .001);
  }
  while (!t.done) kernelTick(g, 1);
  return true;
}
const dist = (prev, i) => { let n = 0; for (let c = i; prev.get(c); c = prev.get(c)[0]) n++; return n; };

// ---- Adapter (integration.js registry) --------------------------------------------------------------------------
export const ADAPTER = Object.freeze({
  kind: 'kernel', field: 'kernel', name: 'Kernel Snake', ready: true,
  start: (g, spec) => startKernel(g, spec),
  input: (g, action, arg) => kernelInput(g, action, arg),
  tick: (g, dt) => kernelTick(g, dt),
  skip: g => skipKernel(g),
  outcome: g => kernelOutcome(g),
  autoplay: (g, skill) => autoplayKernel(g, skill),
  valid: t => !!(t && typeof t === 'object' && Array.isArray(t.builds) && t.builds.length && Array.isArray(t.snake) && t.snake.length >= 1 &&
    Array.isArray(t.gpus) && (t.training===true ? t.w===6 && t.h===5 && t.gpus.length===30 && [2,4].includes(t.target) : t.gpus.length === KERNEL.w * KERNEL.h) && Array.isArray(t.jobs) && Array.isArray(t.hot) && Array.isArray(t.turns) && Number.isSafeInteger(t.target) && t.target > 0),
});
