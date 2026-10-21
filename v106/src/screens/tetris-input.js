// V10.6 Cluster Tetris: the puzzle controller (contract: docs/v106/TETRIS_CONTRACT.md). pit.js
// calls attachTetris once and routes every data-action that starts with "tetris-" here.
// Every input and every tick is one store.act (saved: a reload resumes the same puzzle and can
// never re-roll it). Gravity ticks and inputs repaint the rack in place (paintTetris); full
// renders happen only at START, at the end (the result moment) and on Continue.
// Keyboard: ← → move, ↑ or X rotate, ↓ soft drop, Space hard drop (pit.js ignores keys during the
// integration phase; this listener runs in the capture phase so Space/Enter never reach a button
// mid-puzzle). Touch: the pad (press and hold ◀ ▶ ▼ to repeat) or the rack itself (tap rotates,
// drag moves, drag down soft-drops).
import { puzzleInput, puzzleTick, skipPuzzle, msToGravity } from '../tycoon/tetris.js';
import { finishIntegration } from '../tycoon/arcade.js';
import { paintTetris, noteLock, resetFx, say } from '../ui/tetris.js';

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', x: 'rotate', X: 'rotate', ArrowDown: 'soft', ' ': 'drop', Spacebar: 'drop' };
const GUARD = 900;   // ms after the end in which Space/Enter/taps cannot hit Continue
let ctx = null, pending = 0, lastNow = 0, endedAt = 0, startedAt = 0, hold = null, swipe = null, endSeen = '', pressed = null;

const now = () => performance.now();
const snd = () => { const s = ctx?.sound; try { return typeof s === 'function' ? s() : s; } catch { return null; } };
const play = (name, ...args) => { try { snd()?.[name]?.(...args); } catch { /* sound is optional */ } };
const puzzle = () => { const g = ctx?.store.state; return g?.phase === 'integration' && !g.arcade.confirm ? g.arcade.tetris : null; };
const onScreen = () => !!ctx?.root.querySelector('[data-tt-board]');
const playing = () => { const t = puzzle(); return !!(t && t.started && !t.done && !ctx.store.error && onScreen()); };

export function attachTetris(context) {
  ctx = context; lastNow = now();
  const { root } = ctx;
  // A resumed puzzle: its last lock is history, not news (no flash, no sound on the first repaint).
  const t0 = ctx.store.state?.arcade?.tetris; if (t0?.pieces) noteLock(t0, -Infinity);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKeyUp, true);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('click', onClick);
  root.addEventListener('contextmenu', e => { if (e.target.closest?.('[data-tt-pad],[data-tt-board]')) e.preventDefault(); });
  document.addEventListener('visibilitychange', () => { lastNow = now(); pending = 0; });
  setInterval(tick, 50);
}

export function handleTetrisAction(action) {
  if (!ctx) return false;
  const { act } = ctx;
  if (action === 'tetris-start') {
    const ok = act(g => puzzleInput(g, 'start'));
    if (ok) { startedAt = lastNow = now(); pending = 0; resetFx(); play('bell', { strikes: 1, ring: 1.2 }); say(ctx.root, 'Integration started. The first module is in the loading bay.'); }
    return ok;
  }
  if (action === 'tetris-skip') { const ok = act(skipPuzzle); if (ok) ended(); return ok; }
  if (action === 'tetris-continue') { if (now() - endedAt < GUARD) return false; resetFx(); hold = swipe = null; return act(finishIntegration); }
  return false;
}
// Kept for callers of the stub: one engine tick.
export const tetrisTick = (g, dt) => puzzleTick(g, dt);

// ---- Commits ------------------------------------------------------------------------------------------
// Elapsed time is flushed with the input, in the same saved step, so gravity never runs ahead.
function commit(fn) {
  const dt = pending; pending = 0;
  const ok = ctx.store.act(g => { let changed = dt > 0 ? puzzleTick(g, dt) : false; changed = fn(g) || changed; return changed; });
  after();
  return ok;
}
function send(input) {
  if (!playing()) return false;
  const t = puzzle(), at = t.at;
  let moved = false;
  commit(g => (moved = puzzleInput(g, input)));
  if (moved && store()?.at === at) { if (input === 'rotate') play('blip', 1250, .03); else if (input !== 'drop') play('tap'); }
  return moved;
}
const store = () => ctx.store.state?.arcade?.tetris;
function after() {
  if (ctx.store.error) { ctx.render(); return; }
  const g = ctx.store.state, t = g?.arcade?.tetris;
  if (!t?.pieces) return;
  const L = noteLock(t, now());
  if (L) {
    if (L.bounced) { play('buzz'); say(ctx.root, `That module did not fit: it waits for the next bell.`); }
    else if (L.rows.length) { L.rows.forEach((_, k) => setTimeout(() => play('blip', 880 + 260 * k, .07), 90 * k)); say(ctx.root, `${L.rows.length > 1 ? `${L.rows.length} rows` : 'Row'} powered. ${t.powered} of ${t.h}.`); }
    else play('slap');
  }
  if (t.done) { if (endSeen !== `${g.seed}:${t.id}`) ended(); return; }
  paintTetris(ctx.root, g, now());
}
// The result moment: one full render, then Continue arms after a short guard so a last hammered
// DROP (or a held Space) cannot skip it.
function ended() {
  const g = ctx.store.state, t = g?.arcade?.tetris, out = t?.result;
  endSeen = `${g?.seed}:${t?.id}`; endedAt = now(); hold = swipe = null;
  ctx.render();
  const c = ctx.root.querySelector('[data-tt-continue]');
  if (c) { c.disabled = true; setTimeout(() => { const b = ctx.root.querySelector('[data-tt-continue]'); if (b) { b.disabled = false; b.focus({ preventScroll: true }); } }, GUARD); }
  if (!out) return;
  if (out.perfect) { play('bell', { strikes: 3, gap: .18, f: 990 }); setTimeout(() => play('clatter', 18, .7), 250); }
  else if (out.skipped) play('stamp');
  else { play('stamp'); if (out.reason === 'time') play('alert'); }
  say(ctx.root, out.perfect ? 'Perfect rack. 100% online now, the build is tuned.' : out.skipped ? `Crew baseline: ${Math.round(out.efficiency * 100)}% online now.` : `Rack online: ${Math.round(out.efficiency * 100)}% now, the rest next bell.`);
}

// ---- The ticker: gravity and the puzzle clock ---------------------------------------------------------
// It commits when the next gravity step is due (or every 250 ms for the clock), and only while the
// puzzle is on screen and the tab is visible.
function tick() {
  const n = now(), dt = Math.max(0, (n - lastNow) / 1000); lastNow = n;
  if (!playing() || document.hidden) { pending = 0; return; }
  pending += Math.min(dt, .25);
  if (hold?.input && n >= hold.next) { hold.next = n + (hold.input === 'soft' ? 55 : 80); send(hold.input); return; }
  if (pending * 1000 >= Math.min(msToGravity(puzzle()), 250)) commit(() => false);
}

// ---- Keyboard ------------------------------------------------------------------------------------------
function onKey(e) {
  const g = ctx.store.state;
  if (g?.phase !== 'integration' || !g.arcade.tetris || g.arcade.confirm || e.target.closest?.('input,textarea,select')) return;
  const t = g.arcade.tetris, k = e.key, input = KEYS[k];
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (t.done) { if ((k === ' ' || k === 'Enter') && (e.repeat || now() - endedAt < GUARD)) { e.preventDefault(); e.stopPropagation(); } return; }
  if (!t.started) { if (input && k !== ' ') e.preventDefault(); if (e.repeat && (k === ' ' || k === 'Enter')) e.preventDefault(); return; }
  if (input) {
    e.preventDefault(); e.stopPropagation();
    if (e.repeat && (input === 'drop' || input === 'rotate')) return;
    if (startedAt && now() - startedAt < 250 && input === 'drop') return; // the key that pressed START
    send(input); return;
  }
  // Enter only activates a focused pad key; it never reaches any other button mid-puzzle.
  if (k === 'Enter' && !e.target.closest?.('[data-tt-pad]')) { e.preventDefault(); e.stopPropagation(); }
}
function onKeyUp(e) {
  const g = ctx.store.state;
  if (g?.phase !== 'integration' || !g.arcade.tetris || g.arcade.confirm) return;
  const t = g.arcade.tetris;
  if (e.key === ' ' && ((t.started && !t.done) || (t.done && now() - endedAt < GUARD))) { e.preventDefault(); e.stopPropagation(); }
}

// ---- Pointer: the pad and the rack ------------------------------------------------------------------
function onPointerDown(e) {
  const key = e.target.closest?.('[data-tt-pad]');
  if (key) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); // no focus, no text selection; the click that follows is ignored
    pressed = key;
    if (!playing() || (startedAt && now() - startedAt < 300)) return; // a double tap on START never lands as a drop
    const input = key.dataset.ttPad;
    key.classList.add('is-down');
    hold = { input: ['left', 'right', 'soft'].includes(input) ? input : null, el: key, id: e.pointerId, next: now() + 240 };
    send(input);
    return;
  }
  const board = e.target.closest?.('[data-tt-board]');
  if (board && playing() && e.pointerType !== 'mouse') {
    e.preventDefault();
    const cell = board.querySelector('.tt-cell')?.getBoundingClientRect().width || 30;
    swipe = { x0: e.clientX, y0: e.clientY, t0: now(), dx: 0, dy: 0, cell, id: e.pointerId, used: false };
    try { board.setPointerCapture(e.pointerId); } catch { /* optional */ }
  }
}
function onPointerMove(e) {
  if (!swipe || e.pointerId !== swipe.id || !playing()) return;
  const cols = Math.trunc((e.clientX - swipe.x0) / (swipe.cell * .85)), rows = Math.trunc((e.clientY - swipe.y0) / (swipe.cell * .9));
  while (swipe.dx < cols) { swipe.dx++; swipe.used = true; send('right'); }
  while (swipe.dx > cols) { swipe.dx--; swipe.used = true; send('left'); }
  while (rows > swipe.dy && Math.abs(cols) < 2) { swipe.dy++; swipe.used = true; if (!send('soft')) break; if (puzzle()?.cur?.y === 0) break; }
}
function onPointerUp(e) {
  if (hold && (!e || e.pointerId === hold.id)) { hold.el?.classList.remove('is-down'); hold = null; }
  if (swipe && (!e || e.pointerId === swipe.id)) {
    const s = swipe; swipe = null;
    if (!s.used && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 12 && now() - s.t0 < 400) send('rotate');
  }
}
// Keyboard activation of a focused pad key: a click with no pointer behind it. (A tap's click can
// also report detail 0, so the pointer type decides, and the click after a press is swallowed.)
function onClick(e) {
  const key = e.target.closest?.('[data-tt-pad]');
  if (!key) return;
  if (pressed === key || e.pointerType || e.detail !== 0) { pressed = null; return; }
  send(key.dataset.ttPad);
}
