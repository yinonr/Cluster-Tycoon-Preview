// V10.19 Cable Mania: the view (engine: tycoon/cable.js; controller: screens/arcade-input.js). The data-hall floor is
// a grid of tile buttons (tap or click lays the cable in hand), drawn as 1-bit SVG in the HSC system: ink cable on
// paper, the spine switch an ink box, GPU nodes in their H100/H200/B200 colours and textures. The link signal lights
// cables LED green as it travels; a dropped link shows an orange spark at the open end. paintCable repaints in place.
import { esc } from '../util.js';
import { CABLE, DIRS, pieceMask, handPiece, connectedCable, evaluateCable, cableOutcome, canLay } from '../tycoon/cable.js';
import { introCard, resultBlock, footerFor, meterHTML, gpuClass, pct } from './integration.js';

export const RULE = 'Connect every GPU node to the central switch.';
const KEYS = 'Tap a cable type, then a tile. Tap a placed cable to pick it up; rotate with ⟳. Keyboard: 1–4 select, arrows move, Space places, Delete picks up.';
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
    const [x, y] = END[cell.m], px = 20 + (x - 20) * .68, py = 20 + (y - 20) * .68;
    inner = `<rect x="5" y="5" width="30" height="30" rx="1.5" class="ch-node"/>${[11, 17, 23, 29].map(y => `<line x1="9" y1="${y}" x2="31" y2="${y}" class="ch-slot"/>`).join('')}<circle cx="30" cy="9" r="2.6" class="ch-led${lit ? ' is-lit' : ''}"/><g class="ch-node-port${lit ? ' is-lit' : ''}"><line x1="${px}" y1="${py}" x2="${x}" y2="${y}"/><circle cx="${px}" cy="${py}" r="4"/></g>`;
  } else if (cell.t === 'b') {
    inner = `<rect x="4" y="4" width="32" height="32" class="ch-block"/><rect x="10" y="10" width="20" height="20" class="ch-block-in"/>`;
  } else inner = `<circle cx="20" cy="20" r="1.4" class="ch-dot"/>`;
  const sparks = drops.map(d => `<g class="ch-spark"><circle cx="${END[d][0] * .85 + 3}" cy="${END[d][1] * .85 + 3}" r="5"/><path d="M${END[d][0] * .85 - 1} ${END[d][1] * .85 + 3}h8M${END[d][0] * .85 + 3} ${END[d][1] * .85 - 1}v8"/></g>`).join('');
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${inner}${sparks}</svg>`;
}
function tileLabel(t, i) {
  const c = t.cells[i], x = i % t.w + 1, y = Math.floor(i / t.w) + 1;
  const what = c.t === 's' ? 'central switch' : c.t === 'n' ? `node, ${t.nodes.find(n => n.i === i)?.gpus} ${c.gpu}${connectedCable(t).has(i) ? ', connected' : ''}` : c.t === 'b' ? 'equipment' : c.t === 'c' ? 'cable, tap to pick up' : 'open floor';
  return `Row ${y}, column ${x}: ${what}`;
}
function boardHTML(t) {
  const hand = handPiece(t), ghost = hand && t.started && !t.done && canLay(t, t.cursor) ? pieceMask(hand) : 0, connected = !t.signal.on ? connectedCable(t) : null;
  const drops = new Map(); for (const d of t.drops) drops.set(d.i, [...(drops.get(d.i) || []), d.d]);
  let out = '';
  for (let i = 0; i < t.cells.length; i++) {
    const c = t.cells[i], node = c.t === 'n' ? t.nodes.find(n => n.i === i) : null;
    const lit = !!t.live[i] || !!connected?.has(i);
    const cls = ['ch-cell', `is-${c.t}`, node ? gpuClass(node.gpu) : '', node ? `port-${({ 1: 'north', 2: 'east', 4: 'south', 8: 'west' })[c.m]}` : '', lit ? 'is-live' : '', i === t.cursor && t.started && !t.done ? 'is-cursor' : '', t.last?.i === i ? 'is-new' : '', canLay(t, i) ? 'can-lay' : ''].filter(Boolean).join(' ');
    out += `<button type="button" class="${cls}" data-ch-cell="${i}" aria-label="${esc(tileLabel(t, i))}" tabindex="-1">${tileSVG(c, { lit, drops: drops.get(i) || [], ghost: i === t.cursor ? ghost : 0 })}${node ? `<span class="ch-node-label"><b>${node.gpus}</b>${esc(node.gpu)}</span>` : ''}</button>`;
  }
  return out;
}
function queueHTML(t) {
  const hand = handPiece(t);
  const available = t.queue.filter((p, i) => p.k && (t.selected === undefined ? i >= t.qi : !p.used));
  return (!hand && !t.signal.on && !t.done ? '<p class="ch-empty" role="status">Select another cable type</p>' : '') + Object.keys(PIECE_NAME).map(k => { const count = available.filter(p => p.k === k).length, p = hand?.k === k ? hand : available.find(p => p.k === k);
    return `<button type="button" class="ch-q${hand?.k === k ? ' is-hand' : ''}" data-ch-select="${k}" ${!count || t.signal.on ? 'disabled' : ''} aria-pressed="${hand?.k === k}" aria-label="${PIECE_NAME[k]}, ${count} available${hand?.k === k ? ', selected' : ''}">${tileSVG({ t: 'c', m: p ? pieceMask(p) : 5 })}<small>${PIECE_NAME[k]} ×${count}</small></button>`;
  }).join('');
}
function signalText(t) {
  if (t.done) return t.reason === 'skip' ? 'Crew' : 'Done';
  if (!t.signal.on) return 'PLAN';
  return 'LIVE';
}
function stripHTML(t) {
  const e = evaluateCable(t), connected = t.signal.on ? t.nodes.filter(n => n.online).length : t.nodes.filter(n => connectedCable(t).has(n.i)).length;
  return `<div class="tt-strip arc-strip"><div class="tt-clock" data-ch-clock><small class="tt-cap">NETWORK</small><b data-ch-sec>${signalText(t)}</b></div>` +
    meterHTML(t.signal.on ? e.efficiency : connected / e.nodes, t.signal.on ? 'ONLINE NOW' : 'CONNECTED') +
    `<div class="tt-rowcount"><small class="tt-cap">CONNECTED</small><b data-ch-nodes>${connected}/${e.nodes}</b></div></div>`;
}
function manifest(t) {
  return `<ul class="arc-nodes">${t.nodes.map(n => `<li class="arc-gpu ${gpuClass(n.gpu)}"><i aria-hidden="true"></i><b>${n.gpus}</b> ${esc(n.gpu)}</li>`).join('')}</ul>`;
}
function controls(t) {
  return `<div class="arc-pad ch-pad" role="group" aria-label="Cable controls">` +
    `<button type="button" class="tt-key mat-key" data-arc-key="rotate" ${t.signal.on ? 'disabled' : ''} aria-label="Rotate the cable in hand">⟳ <span class="wide">Rotate</span></button>` +
    `<button type="button" class="tt-key mat-key" data-arc-key="lay" ${t.signal.on ? 'disabled' : ''} aria-label="Lay the cable at the cursor">Lay</button>` +
    `<button type="button" class="tt-key mat-key" data-arc-key="remove" ${t.signal.on ? 'disabled' : ''} aria-label="Pick up the cable at the cursor">Pick up</button>` +
    `<button type="button" class="tt-key tt-key-drop" data-arc-key="send" ${t.signal.on ? 'disabled' : ''} aria-label="Test network; this commits the design">TEST NETWORK</button></div>`;
}
function resultHTML(g, t, out) {
  const d = out.detail || {};
  const result = resultBlock(g, t.builds, out, { perfectLine: 'Every node online, a clean fabric · the build is tuned',
    line: `${d.online}/${d.nodes} nodes online${d.drops ? ` · ${d.drops} dropped link${d.drops > 1 ? 's' : ''}` : ''}` });
  return d.lean?.bonus ? result.replace(/<\/div>$/, `<p class="tt-score">LEAN NETWORK · ${d.lean.saved} fewer cable${d.lean.saved === 1 ? '' : 's'} · +${d.lean.bonus} score</p></div>`) : result;
}

export function cableView(g, ui = {}) {
  const t = g.arcade.cable, out = cableOutcome(g);
  if (!t?.cells) return { title: 'Cable Mania', role: 'report', desk: 'tetris', exit: null, body: '<div class="desk-center"><p>Integrating…</p></div>', footer: out ? footerFor({ out }) : '' };
  const state = out ? 'is-done' : t.started ? 'is-play' : 'is-intro';
  const intro = !t.started && !out ? introCard(g, { kind: 'cable', rule: RULE, keys: KEYS, manifest: manifest(t) }) : '';
  const result = out ? `<div class="tt-overlay tt-finish">${resultHTML(g, t, out)}</div>` : '';
  const body = `<div class="tt arc arc-cable ${state}${out?.perfect ? ' is-perfect' : ''}" data-arc="cable">${stripHTML(t)}` +
    `<div class="tt-field arc-field"><div class="arc-stage"><div class="ch-frame"><span class="tt-baylabel" aria-hidden="true"><img class="arc-seal" src="brand/logo/hsc-mark-white.svg" width="37" height="47" alt="">DATA HALL · ${t.nodes.length} NODES</span>` +
    `<div class="ch-board" data-ch-board style="--cols:${t.w};--rows:${t.h}" role="group" aria-label="Data hall floor, ${t.w} by ${t.h}">${boardHTML(t)}</div>${result}</div>` +
    `<aside class="arc-side"><div class="ch-queue" data-ch-queue aria-label="Cable in hand and next">${queueHTML(t)}</div>${manifest(t)}</aside></div>${intro}</div>` +
    `<span class="tt-say" data-arc-say aria-live="polite"></span></div>`;
  return { title: 'Cable Mania', role: 'report', desk: 'tetris', exit: null, body, footer: footerFor({ out, started: t.started, name: 'Cable Mania', controls: controls(t) }) };
}

// ---- Partial repaint (the controller calls it after each saved step) --------------------------------------------------
export function paintCable(root, g) {
  const t = g?.arcade?.cable, board = root.querySelector('[data-ch-board]');
  if (!t?.cells || !board) return false;
  const html = boardHTML(t);
  if (board.dataset.painted !== html) { board.dataset.painted = html; board.innerHTML = html; }
  const q = root.querySelector('[data-ch-queue]'), qh = queueHTML(t);
  if (q && q.dataset.painted !== qh) { q.dataset.painted = qh; q.innerHTML = qh; }
  const e = evaluateCable(t), connected = t.signal.on ? e.online : t.nodes.filter(n => connectedCable(t).has(n.i)).length, set = (sel, text) => { const el = root.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
  const shown = t.signal.on ? e.efficiency : connected / e.nodes;
  set('[data-ch-sec]', signalText(t)); set('[data-ch-nodes]', `${connected}/${e.nodes}`); set('[data-arc-pct]', pct(shown));
  root.querySelector('[data-arc-fill]')?.style.setProperty('--v', String(shown));
  const cap = root.querySelector('[data-arc-meter] .tt-cap'); if (cap) cap.textContent = t.signal.on ? 'ONLINE NOW' : 'CONNECTED';
  const send = root.querySelector('[data-arc-key="send"]');
  if (send) send.disabled = t.signal.on;
  for (const a of ['rotate', 'lay', 'remove']) { const b = root.querySelector(`[data-arc-key="${a}"]`); if (b) b.disabled = t.signal.on; }
  return true;
}
