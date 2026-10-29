// V10.19 The Scale-Up: the controller for Cable Mania and Kernel Snake (contract: docs/V10_19_INTEGRATION_CONTRACT.md
// §7; Node Tetris keeps screens/tetris-input.js). pit.js calls attachArcade once and routes data-actions starting with
// "int-", "cable-" or "kernel-" here. Every input and every tick is one store.act: the elapsed time is flushed with
// the input in the same saved step, so a reload resumes the same board, signal or stream. Ticks repaint in place
// (paintCable / paintKernel); full renders happen only at START, at the end (the result moment) and on Continue.
// Keys run in the capture phase while playing, so Space/Enter never reach another button mid-game.
//   Cable Mania: arrows/WASD move the cursor, Space/Enter place or pick up, R/X rotate, F tests once;
//   tap a piece type then a tile, tap a placed cable to pick it up. Planning has no timer.
//   Kernel Snake: arrows/WASD steer; swipe the fleet; the four-way pad.
import { integrationInput, integrationTick, skipIntegration, integrationKind, integrationState } from '../tycoon/integration.js';
import { msToNext } from '../tycoon/cable.js';
import { msToMove } from '../tycoon/kernel.js';
import { finishIntegration } from '../tycoon/arcade.js';
import { paintCable } from '../ui/cable.js';
import { paintKernel } from '../ui/kernel.js';
import { say } from '../ui/integration.js';

const GUARD = 900;     // ms after the end in which Space/Enter/taps cannot hit Continue
const STEER = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
let ctx = null, pending = 0, lastNow = 0, endedAt = 0, startedAt = 0, endSeen = '', swipe = null, seen = { last: null, online: 0, drops: 0, ran: 0 };

const now = () => performance.now();
const snd = () => { const s = ctx?.sound; try { return typeof s === 'function' ? s() : s; } catch { return null; } };
const play = (name, ...args) => { try { snd()?.[name]?.(...args); } catch { /* sound is optional */ } };
const kind = () => { const g = ctx?.store.state; return g?.phase === 'integration' && !g.arcade.confirm ? integrationKind(g) : null; };
const game = () => { const k = kind(); return k === 'cable' || k === 'kernel' ? integrationState(ctx.store.state) : null; };
const onScreen = () => !!ctx?.root.querySelector('[data-arc]');
const playing = () => { const t = game(); return !!(t && t.started && !t.done && !ctx.ui.guidanceOpen && !ctx.store.error && onScreen()); };

export function attachArcade(context) {
  ctx = context; lastNow = now();
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKeyUp, true);
  ctx.root.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', () => { swipe = null; });
  ctx.root.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', () => { lastNow = now(); pending = 0; });
  setInterval(tick, 40);
}

export function handleArcadeAction(action) {
  if (!ctx || ctx.ui.guidanceOpen || !game() && action !== 'int-continue') return false;
  if (action === 'int-start') {
    const ok = ctx.act(g => integrationInput(g, 'start'));
    if (ok) { startedAt = lastNow = now(); pending = 0; resetSeen(); play('bell', { strikes: 1, ring: 1.2 }); say(ctx.root, kind() === 'cable' ? 'Connect every GPU node to the central switch. Test when ready.' : 'Started. Steer the workload onto the waiting kernels.'); }
    return ok;
  }
  if (action === 'int-skip') { const ok = ctx.act(skipIntegration); if (ok) ended(); return ok; }
  if (action === 'int-continue') { if (now() - endedAt < GUARD) return false; swipe = null; return ctx.act(finishIntegration); }
  return false;
}
const resetSeen = () => { const t = game(); seen = { last: t?.last?.n ?? t?.last?.i ?? null, online: 0, drops: 0, ran: t?.ran || 0 }; };

// ---- Commits ---------------------------------------------------------------------------------------------------
function commit(fn) {
  const dt = pending; pending = 0;
  const ok = ctx.store.act(g => { let changed = dt > 0 ? integrationTick(g, dt) : false; changed = fn(g) || changed; return changed; });
  after();
  return ok;
}
function send(action, arg) {
  if (!playing()) return false;
  let moved = false;
  commit(g => (moved = integrationInput(g, action, arg)));
  if (moved) { if (action === 'rotate') play('blip', 1250, .03); else if (action === 'lay' || action === 'remove') play('slap'); else if (action === 'send') play('blip', 660, .08); else if (action === 'move' || action === 'turn' || action === 'select') play('tap'); }
  return moved;
}
function after() {
  if (ctx.store.error) { ctx.render(); return; }
  const g = ctx.store.state, t = game();
  if (!t) return;
  // Feedback for what the last step did (sound and a screen-reader line).
  if (kind() === 'cable') {
    const online = t.nodes.filter(n => n.online).length;
    if (online > seen.online) { play('bell', { strikes: 1, f: 990 }); say(ctx.root, `Node online. ${online} of ${t.nodes.length}.`); }
    if (t.drops.length > seen.drops) { play('buzz'); say(ctx.root, 'Dropped link: a cable end led nowhere.'); }
    seen.online = online; seen.drops = t.drops.length;
  } else {
    if (t.ran > seen.ran) { t.ran >= t.target ? play('clatter', 14, .6) : play('blip', 880 + 30 * t.ran, .06); say(ctx.root, `Kernel run. ${t.ran} of ${t.target}.`); }
    seen.ran = t.ran;
  }
  if (t.done) { if (endSeen !== `${g.seed}:${t.id}`) ended(); return; }
  if (kind() === 'cable') paintCable(ctx.root, g); else paintKernel(ctx.root, g);
}
// The result moment: one full render, then Continue arms after a short guard.
function ended() {
  const g = ctx.store.state, t = game(), out = t?.result;
  endSeen = `${g?.seed}:${t?.id}`; endedAt = now(); swipe = null;
  ctx.render();
  const c = ctx.root.querySelector('[data-arc-continue]');
  if (c) { c.disabled = true; setTimeout(() => { const b = ctx.root.querySelector('[data-arc-continue]'); if (b) { b.disabled = false; b.focus({ preventScroll: true }); } }, GUARD); }
  if (!out) return;
  if (out.perfect) { play('bell', { strikes: 3, gap: .18, f: 990 }); setTimeout(() => play('clatter', 18, .7), 250); }
  else { play('stamp'); if (out.reason === 'stall' || out.reason === 'dark') play('alert'); }
  say(ctx.root, out.perfect ? 'Perfect. 100% online now, the build is tuned.' : out.skipped ? `Crew baseline: ${Math.round(out.efficiency * 100)}% online now.` : `${Math.round(out.efficiency * 100)}% online now, the rest next bell.`);
}

// ---- The ticker: the signal or the stream advance on the engine's clock -------------------------------------------
function tick() {
  const n = now(), dt = Math.max(0, (n - lastNow) / 1000); lastNow = n;
  if (!playing() || document.hidden) { pending = 0; return; }
  if (kind() === 'cable' && !game().signal.on) { pending = 0; return; }
  pending += Math.min(dt, .25);
  const t = game(), due = kind() === 'cable' ? msToNext(t) : msToMove(t);
  if (pending * 1000 >= Math.min(due, 250)) commit(() => false);
}

// ---- Keyboard ------------------------------------------------------------------------------------------------
function onKey(e) {
  if (!ctx || ctx.ui.guidanceOpen) return;
  const t = game();
  if (!t || e.target.closest?.('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (t.done) { if ((k === ' ' || k === 'Enter') && (e.repeat || now() - endedAt < GUARD)) { e.preventDefault(); e.stopPropagation(); } return; }
  if (!t.started) { if (STEER[k] && !k.match(/^[wasdWASD]$/)) e.preventDefault(); return; }
  if (startedAt && now() - startedAt < 250 && (k === ' ' || k === 'Enter')) { e.preventDefault(); e.stopPropagation(); return; } // the key that pressed START
  if (kind() === 'kernel') {
    if (STEER[k]) { e.preventDefault(); e.stopPropagation(); send('turn', STEER[k]); return; }
  } else {
    if (STEER[k]) { e.preventDefault(); e.stopPropagation(); if (!e.repeat || k.startsWith('Arrow')) send('move', STEER[k]); return; }
    if (k === ' ' || k === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) send('lay'); return; }
    if (k === 'r' || k === 'R' || k === 'x' || k === 'X') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) send('rotate'); return; }
    if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) send('remove'); return; }
    if (k === 'f' || k === 'F') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) send('send'); return; }
  }
  if (k === 'Enter' && !e.target.closest?.('[data-arc-key]')) { e.preventDefault(); e.stopPropagation(); }
}
function onKeyUp(e) {
  const t = game();
  if (t && e.key === ' ' && ((t.started && !t.done) || (t.done && now() - endedAt < GUARD))) { e.preventDefault(); e.stopPropagation(); }
}

// ---- Pointer: tiles, pad keys, swipes ---------------------------------------------------------------------------
function onPointerDown(e) {
  if (!game()) return;
  const key = e.target.closest?.('[data-arc-key]');
  if (key) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (!playing() || (startedAt && now() - startedAt < 300)) return;
    key.classList.add('is-down'); setTimeout(() => key.classList.remove('is-down'), 120);
    const a = key.dataset.arcKey;
    if (kind() === 'kernel') send('turn', a); else send(a === 'lay' ? 'lay' : a);
    key.dataset.pressed = '1';
    return;
  }
  const cell = e.target.closest?.('[data-ch-cell]');
  if (cell && kind() === 'cable') {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (playing() && !(startedAt && now() - startedAt < 300)) send('lay', Number(cell.dataset.chCell));
    return;
  }
  const piece = e.target.closest?.('[data-ch-select]');
  if (piece && kind() === 'cable') { e.preventDefault(); if (playing()) send('select', piece.dataset.chSelect); return; }
  const board = e.target.closest?.('[data-ks-board]');
  if (board && kind() === 'kernel' && playing()) { e.preventDefault(); swipe = { x: e.clientX, y: e.clientY, id: e.pointerId }; }
}
function onPointerUp(e) {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  send('turn', Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
}
// Keyboard activation of a focused pad key: a click with no pointer behind it.
function onClick(e) {
  const key = e.target.closest?.('[data-arc-key]');
  if (!key || !game()) return;
  if (key.dataset.pressed || e.pointerType || e.detail !== 0) { delete key.dataset.pressed; return; }
  const a = key.dataset.arcKey;
  if (kind() === 'kernel') send('turn', a); else send(a);
}
