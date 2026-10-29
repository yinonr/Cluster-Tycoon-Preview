// V10.19 Cable Hell: the view (engine: tycoon/cable.js; controller: screens/arcade-input.js). The data-hall floor is
// a grid of tile buttons (tap or click lays the cable in hand), drawn as 1-bit SVG in the HSC system: ink cable on
// paper, the spine switch an ink box, GPU nodes in their H100/H200/B200 colours and textures. The link signal lights
// cables LED green as it travels; a dropped link shows an orange spark at the open end. paintCable repaints in place.
import { esc } from '../util.js';
import { CABLE, DIRS, pieceMask, handPiece, evaluateCable, cableOutcome, canLay } from '../tycoon/cable.js';
import { introCard, resultBlock, footerFor, meterHTML, gpuClass, pct } from './integration.js';

export const RULE = 'Cable every node to the switch before the signal arrives.';
const KEYS = '<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>R</kbd> rotate · <kbd>Space</kbd> lay · <kbd>F</kbd> send · or tap a tile';
const END = { 1: [20, 0], 2: [40, 20], 4: [20, 40], 8: [0, 20] };
const PIECE_NAME = { I: 'straight', L: 'corner', T: 'leaf switch', X: 'cross' };

// One tile's drawing in a 40 × 40 box.
function wires(m, cls) {
  return DIRS.filter(d => m & d).map(d => `<line x1="20" y1="20" x2="${END[d][0]}" y2="${END[d][1]}" class="${cls}"/>`).join('');
}
export function tileSVG(cell, { lit = false, drops = [], ghost = 0 } = {}) {
  let inner = '';
  if (cell.t === 'c' || ghost) {
    const m = cell.t === 'c' ? cell.m : ghost;
    inner = `<g class="${cell.t === 'c' ? '' : 'ch-ghost'}">${wires(m, 'ch-wire')}${wires(m, `ch-core${lit ? ' is-lit' : ''}`)}${DIRS.filter(d => m & d).length >= 3 ? '<rect x="13" y="13" width="14" height="14" class="ch-leaf"/>' : '<circle cx="20" cy="20" r="4.6" class="ch-joint"/>'}</g>`;
  } else if (cell.t === 's') {
    inner = `${wires(15, 'ch-stub')}<rect x="6" y="6" width="28" height="28" rx="2" class="ch-spine"/><g class="ch-ports">${[11, 17, 23, 29].map(x => `<rect x="${x - 2}" y="25" width="4" height="4" class="${lit ? 'is-lit' : ''}"/>`).join('')}</g><text x="20" y="20" class="ch-spine-t">SPINE</text>`;
  } else if (cell.t === 'n') {
    inner = `${wires(cell.m, 'ch-wire')}${wires(cell.m, `ch-core${lit ? ' is-lit' : ''}`)}<rect x="5" y="5" width="30" height="30" rx="1.5" class="ch-node"/>${[11, 17, 23, 29].map(y => `<line x1="9" y1="${y}" x2="31" y2="${y}" class="ch-slot"/>`).join('')}<circle cx="30" cy="9" r="2.6" class="ch-led${lit ? ' is-lit' : ''}"/>`;
  } else if (cell.t === 'b') {
    inner = `<rect x="4" y="4" width="32" height="32" class="ch-block"/><rect x="10" y="10" width="20" height="20" class="ch-block-in"/>`;
  } else inner = `<circle cx="20" cy="20" r="1.4" class="ch-dot"/>`;
  const sparks = drops.map(d => `<g class="ch-spark"><circle cx="${END[d][0] * .85 + 3}" cy="${END[d][1] * .85 + 3}" r="5"/><path d="M${END[d][0] * .85 - 1} ${END[d][1] * .85 + 3}h8M${END[d][0] * .85 + 3} ${END[d][1] * .85 - 1}v8"/></g>`).join('');
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${inner}${sparks}</svg>`;
}
function tileLabel(t, i) {
  const c = t.cells[i], x = i % t.w + 1, y = Math.floor(i / t.w) + 1;
  const what = c.t === 's' ? 'spine switch' : c.t === 'n' ? `node, ${t.nodes.find(n => n.i === i)?.gpus} ${c.gpu}${t.live[i] ? ', online' : ''}` : c.t === 'b' ? 'equipment' : c.t === 'c' ? `cable${t.live[i] ? ', live' : ''}` : 'open floor';
  return `Row ${y}, column ${x}: ${what}`;
}
function boardHTML(t) {
  const hand = handPiece(t), ghost = hand && t.started && !t.done && canLay(t, t.cursor) ? pieceMask(hand) : 0;
  const drops = new Map(); for (const d of t.drops) drops.set(d.i, [...(drops.get(d.i) || []), d.d]);
  let out = '';
  for (let i = 0; i < t.cells.length; i++) {
    const c = t.cells[i], node = c.t === 'n' ? t.nodes.find(n => n.i === i) : null;
    const cls = ['ch-cell', `is-${c.t}`, node ? gpuClass(node.gpu) : '', t.live[i] ? 'is-live' : '', i === t.cursor && t.started && !t.done ? 'is-cursor' : '', t.last?.i === i ? 'is-new' : '', canLay(t, i) ? 'can-lay' : ''].filter(Boolean).join(' ');
    out += `<button type="button" class="${cls}" data-ch-cell="${i}" aria-label="${esc(tileLabel(t, i))}" tabindex="-1">${tileSVG(c, { lit: !!t.live[i], drops: drops.get(i) || [], ghost: i === t.cursor ? ghost : 0 })}${node ? `<span class="ch-node-label"><b>${node.gpus}</b>${esc(node.gpu)}</span>` : ''}</button>`;
  }
  return out;
}
function queueHTML(t) {
  const up = t.queue.slice(t.qi, t.qi + CABLE.show);
  if (!up.length) return '<p class="ch-empty">No cable left</p>';
  return up.map((p, k) => `<span class="ch-q${k ? ' is-next' : ' is-hand'}${p.spare ? ' is-spare' : ''}" title="${PIECE_NAME[p.k]}">${tileSVG({ t: 'c', m: pieceMask(p) })}${k ? '' : `<small>${PIECE_NAME[p.k]}</small>`}</span>`).join('');
}
function signalText(t) {
  if (t.done) return t.reason === 'skip' ? 'Crew' : 'Done';
  if (!t.signal.on) return `${Math.ceil(Math.max(0, t.prime - t.ms) / 1000)}s`;
  return t.signal.fast ? 'FAST' : 'LIVE';
}
function stripHTML(t) {
  const e = evaluateCable(t), left = Math.max(0, t.prime - t.ms) / t.prime;
  return `<div class="tt-strip arc-strip"><div class="tt-clock${!t.signal.on && t.prime - t.ms <= 3000 && t.started ? ' is-short' : ''}" data-ch-clock><small class="tt-cap">${t.signal.on ? 'SIGNAL' : 'SIGNAL IN'}</small><b data-ch-sec>${signalText(t)}</b><i class="tt-fuse"><i data-ch-fuse style="--left:${left.toFixed(3)}"></i></i></div>` +
    meterHTML(e.efficiency) +
    `<div class="tt-rowcount"><small class="tt-cap">NODES</small><b data-ch-nodes>${e.online}/${e.nodes}</b></div></div>`;
}
function manifest(t) {
  return `<ul class="arc-nodes">${t.nodes.map(n => `<li class="arc-gpu ${gpuClass(n.gpu)}"><i aria-hidden="true"></i><b>${n.gpus}</b> ${esc(n.gpu)}</li>`).join('')}</ul>`;
}
function controls(t) {
  return `<div class="arc-pad ch-pad" role="group" aria-label="Cable controls">` +
    `<button type="button" class="tt-key mat-key" data-arc-key="rotate" aria-label="Rotate the cable in hand">⟳ <span class="wide">Rotate</span></button>` +
    `<button type="button" class="tt-key mat-key" data-arc-key="lay" aria-label="Lay the cable at the cursor">Lay</button>` +
    `<button type="button" class="tt-key tt-key-drop" data-arc-key="send" aria-label="${t.signal.on ? 'Fast-forward the signal' : 'Send the signal now'}">${t.signal.on ? '»» Fast' : 'Send ▶'}</button></div>`;
}
function resultHTML(g, t, out) {
  const d = out.detail || {};
  return resultBlock(g, t.builds, out, { perfectLine: 'Every node online, a clean fabric · the build is tuned',
    line: `${d.online}/${d.nodes} nodes online${d.drops ? ` · ${d.drops} dropped link${d.drops > 1 ? 's' : ''}` : ''}` });
}

export function cableView(g, ui = {}) {
  const t = g.arcade.cable, out = cableOutcome(g);
  if (!t?.cells) return { title: 'Cable Hell', role: 'report', desk: 'tetris', exit: null, body: '<div class="desk-center"><p>Integrating…</p></div>', footer: out ? footerFor({ out }) : '' };
  const state = out ? 'is-done' : t.started ? 'is-play' : 'is-intro';
  const intro = !t.started && !out ? introCard(g, { kind: 'cable', rule: RULE, keys: KEYS, manifest: manifest(t) }) : '';
  const result = out ? `<div class="tt-overlay tt-finish">${resultHTML(g, t, out)}</div>` : '';
  const body = `<div class="tt arc arc-cable ${state}${out?.perfect ? ' is-perfect' : ''}" data-arc="cable">${stripHTML(t)}` +
    `<div class="tt-field arc-field"><div class="arc-stage"><div class="ch-frame"><span class="tt-baylabel" aria-hidden="true"><img class="arc-seal" src="brand/logo/hsc-mark-white.svg" width="37" height="47" alt="">DATA HALL · ${t.nodes.length} NODES</span>` +
    `<div class="ch-board" data-ch-board style="--cols:${t.w};--rows:${t.h}" role="group" aria-label="Data hall floor, ${t.w} by ${t.h}">${boardHTML(t)}</div>${result}</div>` +
    `<aside class="arc-side"><div class="ch-queue" data-ch-queue aria-label="Cable in hand and next">${queueHTML(t)}</div>${manifest(t)}</aside></div>${intro}</div>` +
    `<span class="tt-say" data-arc-say aria-live="polite"></span></div>`;
  return { title: 'Cable Hell', role: 'report', desk: 'tetris', exit: null, body, footer: footerFor({ out, started: t.started, name: 'Cable Hell', controls: controls(t) }) };
}

// ---- Partial repaint (the controller calls it after each saved step) --------------------------------------------------
export function paintCable(root, g) {
  const t = g?.arcade?.cable, board = root.querySelector('[data-ch-board]');
  if (!t?.cells || !board) return false;
  const html = boardHTML(t);
  if (board.dataset.painted !== html) { board.dataset.painted = html; board.innerHTML = html; }
  const q = root.querySelector('[data-ch-queue]'), qh = queueHTML(t);
  if (q && q.dataset.painted !== qh) { q.dataset.painted = qh; q.innerHTML = qh; }
  const e = evaluateCable(t), set = (sel, text) => { const el = root.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
  set('[data-ch-sec]', signalText(t)); set('[data-ch-nodes]', `${e.online}/${e.nodes}`); set('[data-arc-pct]', pct(e.efficiency));
  root.querySelector('[data-arc-fill]')?.style.setProperty('--v', String(e.efficiency));
  root.querySelector('[data-ch-fuse]')?.style.setProperty('--left', (Math.max(0, t.prime - t.ms) / t.prime).toFixed(3));
  const clock = root.querySelector('[data-ch-clock]');
  if (clock) { clock.classList.toggle('is-short', !t.signal.on && t.prime - t.ms <= 3000); const cap = clock.querySelector('.tt-cap'); if (cap) cap.textContent = t.signal.on ? 'SIGNAL' : 'SIGNAL IN'; }
  const send = root.querySelector('[data-arc-key="send"]');
  if (send) { const label = t.signal.on ? '»» Fast' : 'Send ▶'; if (send.textContent !== label) send.textContent = label; send.disabled = t.signal.fast; }
  return true;
}
