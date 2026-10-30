// V20 Kernel Snake: the view (engine: tycoon/kernel.js; controller: screens/arcade-input.js). The fleet is a
// 12 × 12 grid of GPUs tinted by type (H100 green, H200 blue, B200 copper, with their textures); the workload stream
// is ink, its head a Note Yellow scheduler; jobs wait as GPU-coloured kernels; a GPU that has run a job stays lit;
// throttled GPUs are hatched with an orange LED. paintKernel repaints the grid in place.
import { esc } from '../util.js';
import { evaluateKernel, kernelOutcome } from '../tycoon/kernel.js';
import { introCard, resultBlock, footerFor, meterHTML, gpuClass, pct } from './integration.js';

export const RULE = 'Run the workload over every job. Don’t stall.';
const KEYS = '<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> or <kbd>WASD</kbd> steer · or swipe the fleet';

function gridHTML(t) {
  const body = new Map(t.snake.map((i, k) => [i, k])), jobs = new Map(t.jobs.map(j => [j.i, j])), hot = new Set(t.hot);
  let out = '';
  for (let i = 0; i < t.gpus.length; i++) {
    const k = body.get(i), cls = ['ks-cell', gpuClass(t.gpus[i])];
    if (t.busy[i]) cls.push('is-busy');
    if (hot.has(i)) cls.push('is-hot');
    if (jobs.has(i)) cls.push('is-job');
    if (k !== undefined) cls.push(k === 0 ? `is-head dir-${t.dir}` : k === t.snake.length - 1 ? 'is-body is-tail' : 'is-body');
    if (t.crash?.i === i) cls.push('is-crash');
    if (t.last?.i === i && k === 0) cls.push('is-eat');
    out += `<span class="${cls.join(' ')}"></span>`;
  }
  return out;
}
function stripHTML(t) {
  const e = evaluateKernel(t), left = Math.max(0, t.seconds - t.ms / 1000);
  if (t.training) return `<div class="tt-strip training-progress"><b>Run both jobs</b><div class="tt-rowcount"><small class="tt-cap">JOBS</small><b data-ks-count>${t.ran}/${t.target}</b></div></div>`;
  return `<div class="tt-strip arc-strip"><div class="tt-clock${left <= 6 && t.started && !t.done ? ' is-short' : ''}" data-ks-clock><small class="tt-cap">TIME</small><b data-ks-sec>${Math.ceil(left)}</b><i class="tt-fuse"><i data-ks-fuse style="--left:${(left / t.seconds).toFixed(3)}"></i></i></div>` +
    meterHTML(e.efficiency, 'PRODUCTIVE') +
    `<div class="tt-rowcount"><small class="tt-cap">KERNELS</small><b data-ks-count>${t.ran}/${t.target}</b></div></div>`;
}
function manifest(t) {
  const by = {}; for (const g of t.gpus) by[g] = (by[g] || 0) + 1;
  return `<ul class="arc-nodes">${Object.keys(by).map(g => `<li class="arc-gpu ${gpuClass(g)}"><i aria-hidden="true"></i>${esc(g)} fleet</li>`).join('')}<li class="arc-goal"><b>${t.target}</b> kernels to run</li></ul>`;
}
function controls(training = false) {
  const key = (d, label) => `<button type="button" class="tt-key mat-key ks-${d}" data-arc-key="${d}" aria-label="${training ? 'Move one cell' : 'Steer'} ${d}">${label}</button>`;
  return `<div class="arc-pad ks-pad" role="group" aria-label="Steering">${key('left', '◀')}${key('up', '▲')}${key('down', '▼')}${key('right', '▶')}</div>`;
}
function resultHTML(g, t, out) {
  if(t.training) return `<div class="tt-result training-result" role="status"><strong class="tt-stamp">${out.perfect?'BOTH JOBS RAN':'TRY A DIFFERENT TURN'}</strong><p>${out.perfect?'The workload reached both jobs. You’ve operated your new cluster.':'Turn before the edge or your own queue. Retry this short workload for free.'}</p></div>`;
  const d = out.detail || {}, why = d.crash === 'hot' ? 'Stalled on a throttled GPU' : d.crash === 'self' ? 'Stalled on its own queue' : d.crash === 'edge' ? 'Ran off the fleet' : out.reason === 'time' ? 'Time' : '';
  return resultBlock(g, t.builds, out, { perfectLine: 'Every kernel ran, no stalls · the build is tuned', line: `${why ? `${why} · ` : ''}${d.kernels}/${d.target} kernels run` });
}

export function kernelView(g) {
  const t = g.arcade.kernel, out = kernelOutcome(g), workshop = !!g.arcade.workshop;
  const name = workshop || t?.training ? 'Cluster Snake' : 'Kernel Snake';
  if (!t?.gpus) return { title: name, role: 'report', desk: 'tetris', exit: null, body: '<div class="desk-center"><p>Integrating…</p></div>', footer: out ? footerFor({ out, workshop }) : '' };
  const state = out ? 'is-done' : t.started ? 'is-play' : 'is-intro';
  const intro = !t.started && !out ? introCard(g, { kind: 'kernel', rule: RULE, keys: KEYS, manifest: manifest(t) }) : '';
  const result = out ? `<div class="tt-overlay tt-finish">${resultHTML(g, t, out)}</div>` : '';
  const body = `<div class="tt arc arc-kernel ${t.training ? 'is-training' : ''} ${state}${out?.perfect ? ' is-perfect' : ''}" data-arc="kernel">${stripHTML(t)}${t.training ? '' : '<p class="ks-hazard-legend">Orange / hatched tiles are throttled GPUs. Hitting one ends the run.</p>'}` +
    `<div class="tt-field arc-field"><div class="arc-stage"><div class="ks-frame"><span class="tt-baylabel" aria-hidden="true"><img class="arc-seal" src="brand/logo/hsc-mark-white.svg" width="37" height="47" alt="">${t.training?'PRACTICE WORKLOAD · 2 JOBS':`FLEET · ${t.gpus.length} GPU GROUPS`}</span>` +
    `<div class="ks-board" data-ks-board style="--cols:${t.w};--rows:${t.h}" role="img" aria-label="${esc(`Fleet grid: ${t.ran} of ${t.target} kernels run, stream length ${t.snake.length}, heading ${t.dir}`)}">${gridHTML(t)}</div>${result}</div>` +
    `<aside class="arc-side">${t.training ? '<p class="training-board-note">Each arrow press moves one cell in this lesson. The main game moves continuously.</p>' : manifest(t)}</aside></div>${intro}</div>` +
    `<span class="tt-say" data-arc-say aria-live="polite"></span></div>`;
  return { title: name, role: 'report', desk: 'tetris', exit: null, body, footer: footerFor({ out, started: t.started, name, workshop, training: !!t.training, controls: controls(!!t.training) }) };
}

export function paintKernel(root, g) {
  const t = g?.arcade?.kernel, board = root.querySelector('[data-ks-board]');
  if (!t?.gpus || !board) return false;
  const cells = board.children;
  if (cells.length !== t.gpus.length) board.innerHTML = gridHTML(t);
  else {
    const html = gridHTML(t), tmp = html.match(/class="[^"]*"/g);
    for (let i = 0; i < cells.length; i++) { const c = tmp[i].slice(7, -1); if (cells[i].className !== c) cells[i].className = c; }
  }
  board.setAttribute('aria-label', `Fleet grid: ${t.ran} of ${t.target} kernels run, stream length ${t.snake.length}, heading ${t.dir}`);
  const e = evaluateKernel(t), left = Math.max(0, t.seconds - t.ms / 1000), set = (sel, text) => { const el = root.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
  set('[data-ks-sec]', String(Math.ceil(left))); set('[data-ks-count]', `${t.ran}/${t.target}`); set('[data-arc-pct]', pct(e.efficiency));
  root.querySelector('[data-arc-fill]')?.style.setProperty('--v', String(e.efficiency));
  root.querySelector('[data-ks-fuse]')?.style.setProperty('--left', (left / t.seconds).toFixed(3));
  root.querySelector('[data-ks-clock]')?.classList.toggle('is-short', left <= 6 && !t.done);
  return true;
}
