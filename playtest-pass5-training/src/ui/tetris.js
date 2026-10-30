import { workshopIntro, workshopResult, workshopFraction } from './workshop.js';
// V10.6 Cluster Tetris, V20 Node Tetris (renamed; mechanics unchanged): the puzzle's view (contract: docs/v106/TETRIS_CONTRACT.md; design:
// docs/v106/CLUSTER_TETRIS.md). tetrisView(g, ui) returns a focus view like every desk; between
// full renders the controller calls paintTetris(root, g, now) to repaint the rack, the clock and
// the meter in place (classes only, so running animations are never restarted).
import { esc } from '../util.js';
import { PILOT_TIMING } from './pit-ledger.js';
import { FOUNDER, gradeOf, gradeGains } from '../tycoon/founder.js';
import { TETRIS, puzzleOutcome, evaluate, currentCells, landing, rotated, dims } from '../tycoon/tetris.js';

const button = (action, label, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${label}</button>`;
const pct = x => `${Math.round(x * 100)}%`;
const SIZE_WORD = { H100: 'small', H200: 'medium', B200: 'large' };
const gpuClass = gpu => `g-${String(gpu).toLowerCase()}`;

// ---- Transient effects (presentation only, never saved) ---------------------------------------------
// The controller reports each lock (t.last.n): the module flashes, its powered rows sweep, a bounced
// module shows where it stuck out. Effects expire on their own; repaints keep them until then.
const fx = { n: -1, cells: new Map(), rows: new Map(), bounce: null };
export function noteLock(t, now) {
  const L = t?.last;
  if (!L || L.n === fx.n) return null;
  fx.n = L.n;
  const cells = rotated(t.pieces[L.i].cells, L.r).map(([cx, cy]) => (L.y + cy) * t.w + L.x + cx);
  if (L.bounced) fx.bounce = { cells, gpu: t.pieces[L.i].gpu, until: now + 900 };
  else for (const c of cells) fx.cells.set(c, now + 420);
  for (const y of L.rows) fx.rows.set(y, now + 1100);
  return L;
}
export const resetFx = () => { fx.n = -1; fx.cells.clear(); fx.rows.clear(); fx.bounce = null; };
const live = (map, k, now) => { const u = map.get(k); if (u === undefined) return false; if (u > now) return true; map.delete(k); return false; };

// ---- The rack --------------------------------------------------------------------------------------------
// Rows whose empty slot sits under a module can never power up (the slot is unreachable).
function deadRows(t) {
  const dead = new Set();
  for (let x = 0; x < t.w; x++) {
    let covered = false;
    for (let y = t.bay; y < t.rows; y++) { const v = t.cells[y * t.w + x]; if (v !== -1) covered = true; else if (covered) dead.add(y); }
  }
  return dead;
}
function rowFull(t, y) { for (let x = 0; x < t.w; x++) if (t.cells[y * t.w + x] === -1) return false; return true; }
function cellClasses(t, now) {
  const n = t.rows * t.w, own = new Array(n).fill(null), cls = new Array(n).fill('');
  for (let i = 0; i < n; i++) {
    const v = t.cells[i];
    if (v >= 0) { own[i] = `p${v}`; cls[i] = gpuClass(t.pieces[v].gpu); }
    else if (v === -2) { own[i] = 'sw'; cls[i] = 'g-sw'; }
  }
  if (t.cur) {
    const cells = currentCells(t), gy = landing(t), gpu = gpuClass(t.pieces[t.at].gpu);
    if (gy !== null && gy !== t.cur.y) for (const [cx, cy] of cells) { const i = (gy + cy) * t.w + t.cur.x + cx; if (!own[i]) { own[i] = 'ghost'; cls[i] = `${gpu} is-ghost`; } }
    for (const [cx, cy] of cells) { const i = (t.cur.y + cy) * t.w + t.cur.x + cx; own[i] = 'cur'; cls[i] = `${gpu} is-cur`; }
  }
  if (fx.bounce && fx.bounce.until > now && !t.done) for (const i of fx.bounce.cells) if (!own[i] && i >= 0 && i < n) { own[i] = 'bounce'; cls[i] = `${gpuClass(fx.bounce.gpu)} is-bounce`; }
  for (let i = 0; i < n; i++) {
    if (!own[i]) continue;
    const x = i % t.w, j = [];
    if (i >= t.w && own[i - t.w] === own[i]) j.push('j-t');
    if (x < t.w - 1 && own[i + 1] === own[i]) j.push('j-r');
    if (i + t.w < n && own[i + t.w] === own[i]) j.push('j-b');
    if (x > 0 && own[i - 1] === own[i]) j.push('j-l');
    if (live(fx.cells, i, now)) j.push('is-new');
    cls[i] = `${cls[i]} ${j.join(' ')}`.trim();
  }
  return cls.map(c => c ? `tt-cell ${c}` : 'tt-cell');
}
function rowClass(t, y, dead, now) {
  if (y < t.bay) return `tt-row is-bay${y === 0 ? ' is-bay-top' : ''}`;
  const full = rowFull(t, y);
  return `tt-row is-rack${y === t.bay ? ' is-lip' : ''}${full ? ' is-powered' : dead.has(y) ? ' is-dead' : ''}${full && live(fx.rows, y, now) ? ' is-fresh' : ''}`;
}
function rackRows(t, now) {
  const cls = cellClasses(t, now), dead = deadRows(t), out = [];
  for (let y = 0; y < t.rows; y++) {
    const u = y >= t.bay ? `U${t.rows - y}` : '';
    out.push(`<div class="${rowClass(t, y, dead, now)}" style="--i:${Math.max(0, t.rows - 1 - y)}"><i class="tt-u" aria-hidden="true">${u}</i>${cls.slice(y * t.w, y * t.w + t.w).map(c => `<span class="${c}"></span>`).join('')}<i class="tt-led" aria-hidden="true"></i></div>`);
  }
  return out.join('');
}
function rackLabel(t) {
  const e = evaluate(t), cur = t.cur ? `Module ${t.at + 1} of ${t.pieces.length}, ${t.pieces[t.at].gpu}, column ${t.cur.x + 1}.` : '';
  return `Rack ${t.w} wide, ${t.h} rows: ${e.rows} powered. ${cur}`;
}

// ---- Small pieces ------------------------------------------------------------------------------------------
export const BROKER_SHAPES = Object.freeze({
  H100: [[0,0],[1,0]],
  H200: [[0,0],[0,1],[1,1]],
  B200: [[0,0],[1,0],[2,0],[1,1]],
});
export function mini(piece, cls = '') {
  const [w, h] = dims(piece.cells);
  return `<span class="tt-mini ${gpuClass(piece.gpu)} ${cls}" style="--w:${w};--h:${h}" aria-hidden="true">${piece.cells.map(([x, y]) => `<i style="grid-area:${y + 1}/${x + 1}"></i>`).join('')}</span>`;
}
function nextHTML(t, workshop = false) {
  if (!t.started || t.done) return '';
  const up = t.pieces.slice(t.at + 1, t.at + 4), more = t.pieces.length - t.at - 1 - up.length;
  return `<small class="tt-cap">NEXT</small>${up.map((p, k) => `<span class="tt-next-item${k ? ' is-later' : ''}">${mini(p)}<b>${esc(p.gpu)}</b></span>`).join('') || '<span class="tt-next-item is-empty">last module</span>'}${more > 0 ? `<small class="tt-more">+${more}</small>` : ''}` +
    (t.out?.length ? `<small class="tt-out" title="${workshop ? 'Modules that did not fit do not earn a prize' : 'Modules that did not fit wait for the next bell'}">${t.out.length} ${workshop ? 'unpowered' : 'next bell'}</small>` : '');
}
function manifest(t) {
  const by = {};
  for (const p of t.pieces) (by[p.gpu] ||= []).push(p);
  return `<ul class="tt-manifest">${Object.entries(by).map(([gpu, list]) => `<li class="${gpuClass(gpu)}"><span class="tt-shapes">${list.slice(0, 3).map(p => mini(p)).join('')}</span><b>${list.length} × ${esc(gpu)}</b><small>${list[0].cells.length}-slot · ${SIZE_WORD[gpu] || ''}</small></li>`).join('')}</ul>`;
}
const recipeText = r => Object.entries(r || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${esc(k)}`).join(' + ');

// What each build stands to gain or wait for: the engine's own rules, in one line each.
function stakes(g, t) {
  if (t.training) return '<p class="training-board-note">Fit your H100 and H200 into Node Tetris. A full row powers up, contributing to integration efficiency and score.</p>';
  if (g.arcade.workshop) return workshopIntro(g, 'node');
  const builds = t.builds.map(id => g.company.builds.find(b => b.id === id)).filter(Boolean), T = FOUNDER.tuned, need = pct(FOUNDER.researchOnline);
  const lines = builds.map(b => {
    const R = b.reward || {};
    const what = R.agi ? `runs at ${need}+; grade S adds 10% AGI odds, A 5%` : R.revenue ? 'revenue scales with the share online' : R.rack ? 'rack output scales with the share online' : R.level ? `finishes now at ${need}+, else waits a bell` : R.hype ? `completes now at ${need}+, else waits a bell` : R.pilotRevenue ? PILOT_TIMING : R.cash ? 'prize paid once 100% is online' : 'comes online by share';
    return `<li><b>${esc(b.name)}</b><span>${what}</span></li>`;
  });
  const has = k => builds.some(b => b.reward?.[k]);
  const tune = [has('revenue') && `+${pct(T.revenue)} revenue`, has('rack') && `+${T.rack} rack GPU a round`, has('level') && `+${pct(T.breakthrough)} breakthrough odds`].filter(Boolean);
  const research = builds.some(b => b.lane === 'research' || b.kind === 'partner' || b.moonshot !== undefined), serving = builds.some(b => !(b.lane === 'research' || b.kind === 'partner' || b.moonshot !== undefined));
  const lasting = [serving && 'serving', research && 'research'].filter(Boolean).join(' + ');
  return `<ul class="tt-stakes">${lines.join('')}${tune.length ? `<li class="tt-tune"><b>PERFECT</b><span>tunes it: ${tune.join(' · ')}</span></li>` : ''}<li class="tt-tune"><b>GRADE S · A</b><span>lasting ${lasting} efficiency</span></li></ul>`;
}

// ---- The strip: clock, ONLINE NOW meter, rows --------------------------------------------------------
function stripHTML(t, workshop = false) {
  const e = evaluate(t), left = Math.max(0, t.seconds - t.ms / 1000);
  const shown = workshop ? workshopFraction(e.efficiency, t.result?.skipped) : e.efficiency;
  if (t.training) return `<div class="tt-strip training-progress"><b>Place both GPU shapes</b><div class="tt-rowcount"><small class="tt-cap">RACK ROW</small><b data-tt-rows>${e.rows}/${t.h}</b></div></div>`;
  return `<div class="tt-strip"><div class="tt-clock" data-tt-clock><small class="tt-cap">TIME</small><b data-tt-sec>${Math.ceil(left)}</b><i class="tt-fuse"><i data-tt-fuse style="--left:${(left / t.seconds).toFixed(3)}"></i></i></div>` +
    `<div class="tt-meter" data-tt-meter${workshop ? ' data-workshop-meter' : ''}><small class="tt-cap">${workshop ? 'THIS ATTEMPT' : 'ONLINE NOW'}</small><b data-tt-pct>${pct(shown)}</b><span class="tt-bar" aria-hidden="true">${workshop ? '' : '<i class="tt-bar-base"></i>'}<i class="tt-bar-fill" data-tt-fill style="--v:${shown}"></i>${workshop ? '' : '<i class="tt-bar-skip"></i>'}</span><small class="tt-bar-legend" aria-hidden="true">${workshop ? '<span>0%</span><span>100% prize</span>' : `<span>${pct(TETRIS.floor)} base</span><span>skip ${pct(TETRIS.skip)}</span>`}</small></div>` +
    `<div class="tt-rowcount"><small class="tt-cap">ROWS</small><b data-tt-rows>${e.rows}/${t.h}</b></div></div>`;
}

// ---- The finish ------------------------------------------------------------------------------------------
// V10.15: one line for the grade and the lasting bonus it leaves (previewed from the engine's rule).
function gradeLine(g, t, out) {
  const grade = gradeOf(out), builds = t.builds.map(id => g.company.builds.find(b => b.id === id)).filter(Boolean), gains = gradeGains(g, grade, builds);
  const parts = Object.entries(gains).map(([k, d]) => `+${Math.max(1, Math.round(d * 100))}% ${k === 'readiness' ? 'FRONTIER READINESS' : `${k.toUpperCase()} EFFICIENCY`}`);
  return `<p class="tt-grade grade-${grade.toLowerCase()}"><b>${grade === 'CREW' ? 'CREW' : `GRADE ${grade}`}</b>${parts.length ? `<span>${parts.join(' · ')}</span>` : `<span>${grade === 'C' ? 'no lasting bonus' : 'bonus at its cap'}</span>`}</p>`;
}
function resultHTML(g, t, out, legacy = false) {
  if (t.training && legacy) return `<div class="tt-result training-result" role="status"><strong class="tt-stamp">${out.perfect ? 'RACK PLAN READY' : 'LET’S TRY THAT AGAIN'}</strong><p>${out.perfect ? 'Both shapes fit. Your GPUs remain reserved for the infrastructure build.' : 'Try placing the shapes again.'}</p></div>`;
  if (t.training) return `<div class="tt-result training-result" role="status"><strong class="tt-stamp">${out.perfect ? 'NODES INTEGRATED' : 'LET’S TRY THAT AGAIN'}</strong><p>${out.perfect ? 'Both GPU shapes fit. Bring your model online.' : 'The shapes did not complete the row. Retry freely: place the H100 at one side, then fit the H200 beside it.'}</p></div>`;
  if (g.arcade.workshop) return workshopResult(g, 'node', out);
  const delayed = 1 - out.efficiency, grade = gradeLine(g, t, out);
  if (out.skipped) return `<div class="tt-result is-crew" role="status"><strong class="tt-stamp">CREW BASELINE · ${pct(out.efficiency)}</strong>${grade}<p>The crew racked it: ${pct(delayed)} next bell.</p></div>`;
  if (out.perfect) return `<div class="tt-result is-perfect" role="status"><strong class="tt-stamp">100% INTEGRATED</strong>${grade}<p>Perfect rack · the build is tuned</p><p class="tt-score">Score ${out.score.toLocaleString('en-US')} · ${out.seconds}s</p></div>`;
  const why = out.reason === 'time' ? 'Time. ' : '';
  return `<div class="tt-result" role="status"><strong class="tt-stamp">${pct(out.efficiency)} INTEGRATED</strong>${grade}<p>${why}${out.rows}/${out.height} rows powered · ${pct(delayed)} next bell${out.bounced ? ` · ${out.bounced} module${out.bounced > 1 ? 's' : ''} bounced` : ''}</p><p class="tt-score">Score ${out.score.toLocaleString('en-US')}</p></div>`;
}

// V10.18 final polish (owner): the only how-to-play sentence. Stakes and outcomes show beside the rack and in the result.
export const RULE = 'Fill whole rows to power them.';
const KEYS = '<kbd>←</kbd><kbd>→</kbd> move · <kbd>↑</kbd> rotate · <kbd>↓</kbd> soft · <kbd>Space</kbd> drop';

export function tetrisView(g, ui = {}, now = globalThis.performance?.now?.() ?? 0) {
  const t = g.arcade.tetris, out = puzzleOutcome(g);
  if (!t?.pieces) return { title: t?.training ? 'Integrate your nodes' : 'Node Tetris', role: 'report', desk: 'tetris', exit: null, body: '<div class="desk-center"><p>Integrating…</p></div>', footer: out ? button('tetris-continue', 'Continue', 'class="mat-move rail-commit rail-solo" data-autofocus') : '' };
  const state = out ? 'is-done' : t.started ? 'is-play' : 'is-intro';
  const intro = !t.started && !out ? t.training
    ? `<div class="tt-overlay tt-intro"><div class="tt-card mat-paper"><p class="tt-eyebrow">GPU TRAINING · NODE TETRIS</p><h3>${ui.training?.legacySequence ? 'Plan your practice rack' : 'Integrate your nodes'}</h3>${manifest(t)}<p>${ui.training?.legacySequence ? 'Place your reserved GPUs.' : 'Fit your H100 and H200 into Node Tetris.'}</p><p>A full row powers up, contributing to integration efficiency and score.</p><p class="tt-keys">${KEYS}</p></div></div>`
    : `<div class="tt-overlay tt-intro"><div class="tt-card mat-paper"><p class="tt-eyebrow">${g.arcade.workshop ? 'FREE PLAY' : 'THE BELL'} · NODE TETRIS</p><h3>${g.arcade.workshop ? 'Loaner rack' : `Integrate ${recipeText(t.recipe)}`}</h3>${g.arcade.workshop ? workshopIntro(g, 'node') : manifest(t)}<p class="tt-rule-big">${esc(RULE)}</p><p class="tt-keys">${KEYS}</p></div></div>` : '';
  const result = out ? `<div class="tt-overlay tt-finish">${resultHTML(g, t, out, !!ui.training?.legacySequence)}</div>` : '';
  const body = `<div class="tt ${t.training ? 'is-training' : ''} ${state}${out?.perfect ? ' is-perfect' : ''}" data-tt style="--rows:${t.rows};--cols:${t.w}">${stripHTML(t, !!g.arcade.workshop)}` +
    `<div class="tt-field"><div class="tt-stage"><div class="tt-rackframe"><span class="tt-baylabel" aria-hidden="true">LOADING BAY</span><div class="tt-rack" data-tt-board role="img" aria-label="${esc(rackLabel(t))}">${rackRows(t, now)}</div>${result}</div>` +
    `<aside class="tt-side"><div class="tt-next" data-tt-next>${nextHTML(t, !!g.arcade.workshop)}</div><div class="tt-side-more">${stakes(g, t)}<p class="tt-keys">${KEYS}</p></div></aside></div>${intro}</div>` +
    `<span class="tt-say" data-tt-say aria-live="polite"></span></div>`;
  let footer = out ? button('tetris-continue', 'Continue <span aria-hidden="true">→</span>', 'class="mat-move rail-commit rail-solo" data-tt-continue data-autofocus aria-label="Continue to the board update"')
    : !t.started ? button('tetris-skip', `Skip<span class="wide"> · crew baseline</span> · ${pct(TETRIS.skip)}`, `class="mat-exit rail-quiet tt-skip" aria-label="Skip the puzzle: the integration crew brings ${pct(TETRIS.skip)} online now, the rest next bell"`) + button('tetris-start', 'Start <span class="wide">integration </span><span aria-hidden="true">▶</span>', 'class="mat-move rail-commit" data-autofocus aria-label="Start integration"')
    : `<div class="tt-pad" role="group" aria-label="Rack controls">${pad('left', '◀', 'Move left')}${pad('rotate', '⟳', 'Rotate')}${pad('right', '▶', 'Move right')}${pad('soft', '▼', 'Soft drop')}${pad('drop', '<span aria-hidden="true">⤓</span> DROP', 'Hard drop', 'tt-key-drop')}</div>`;
  if (g.arcade.workshop) footer = footer.replace('Continue <span', 'Back to board update <span').replace('Continue to the board update', 'Return to the board update and collect your best-prize improvement').replace('Start integration', 'Start Node Tetris').replace('integration </span>', 'Node Tetris </span>').replace(/Skip<span class="wide"> · crew baseline<\/span> · 75%/, 'Leave practice').replace('Skip the puzzle: the integration crew brings 75% online now, the rest next bell', 'Leave practice without a prize');
  if (t.training) footer = out ? button(out.perfect && !out.skipped ? 'training-continue' : 'training-retry', out.perfect && !out.skipped ? ui.training?.legacySequence ? 'Rack planned · continue →' : 'Bring model online →' : 'Try the rack again →', 'class="mat-move rail-commit rail-solo" data-tt-continue data-autofocus') : !t.started ? button('tetris-start','Start placing GPUs →','class="mat-move rail-commit rail-solo" data-autofocus') : footer;
  return { title: t.training ? ui.training?.legacySequence ? 'Plan your practice rack' : 'Integrate your nodes' : 'Node Tetris', role: 'report', desk: 'tetris', exit: null, body, footer };
}
// Pad keys carry no data-action: the controller owns them (press-and-hold on touch and mouse,
// keyboard activation through click).
const pad = (input, label, aria, cls = '') => `<button type="button" class="tt-key mat-key ${cls}" data-tt-pad="${input}" aria-label="${aria}">${label}</button>`;

// ---- Partial repaint --------------------------------------------------------------------------------------
export function paintTetris(root, g, now = 0) {
  const t = g?.arcade?.tetris, board = root.querySelector('[data-tt-board]');
  if (!t?.pieces || !board) return false;
  const rows = board.children;
  if (rows.length !== t.rows) { board.innerHTML = rackRows(t, now); }
  else {
    const cls = cellClasses(t, now), dead = deadRows(t);
    for (let y = 0; y < t.rows; y++) {
      const row = rows[y], rc = rowClass(t, y, dead, now);
      if (row.className !== rc) row.className = rc;
      const cells = row.querySelectorAll('.tt-cell');
      for (let x = 0; x < t.w; x++) { const c = cls[y * t.w + x]; if (cells[x] && cells[x].className !== c) cells[x].className = c; }
    }
  }
  board.setAttribute('aria-label', rackLabel(t));
  const e = evaluate(t), left = Math.max(0, t.seconds - t.ms / 1000);
  const set = (sel, text) => { const el = root.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
  const shown = g.arcade.workshop ? workshopFraction(e.efficiency, t.result?.skipped) : e.efficiency;
  set('[data-tt-sec]', String(Math.ceil(left))); set('[data-tt-pct]', pct(shown)); set('[data-tt-rows]', `${e.rows}/${t.h}`);
  root.querySelector('[data-tt-fuse]')?.style.setProperty('--left', (left / t.seconds).toFixed(3));
  root.querySelector('[data-tt-fill]')?.style.setProperty('--v', String(shown));
  root.querySelector('[data-tt-clock]')?.classList.toggle('is-short', left <= 5 && !t.done);
  const next = root.querySelector('[data-tt-next]'), html = nextHTML(t, !!g.arcade.workshop);
  if (next && next.dataset.painted !== html) { next.dataset.painted = html; next.innerHTML = html; }
  return true;
}
export function say(root, text) { const el = root.querySelector('[data-tt-say]'); if (el) el.textContent = text; }
