// THE TYCOON SCORE, LIVE (V6): the total, its three parts, a bar whose segments are each
// part's share of the whole (a negative part is its own red segment, never hidden), and a
// line saying what just moved it. Reads the mode's liveScore: the saved game plus this floor.

import { $, esc, int } from '../util.js';

const signed = (n) => `${n < 0 ? '−' : '+'}${int(Math.abs(n))}`;

export function barHTML(s) {
  const parts = [['profit', s.profit], ['clout', s.clout], ['cp', s.cp]];
  const span = parts.reduce((t, [, v]) => t + Math.abs(v), 0) || 1;
  const pos = parts.filter(([, v]) => v > 0).map(([k, v]) => `<span class="seg ${k}" style="width:${(100 * v) / span}%"></span>`).join('');
  const neg = parts.filter(([, v]) => v < 0).map(([k, v]) => `<span class="seg neg ${k}" style="width:${(100 * -v) / span}%" title="${k} below zero"></span>`).join('');
  return `<div class="ty-bar" aria-hidden="true">${neg}${pos}</div>`;
}

export function createTycoonBar(node, { mode, run }) {
  node.innerHTML = `
    <div class="ty-total"><span class="ui">TYCOON SCORE</span> <b class="hl ty-n"></b> <span class="ty-delta ui"></span></div>
    <div class="ty-parts ui">
      <span class="ty-part profit">PROFIT <b></b></span>
      <span class="ty-part clout">CLOUT <b></b></span>
      <span class="ty-part cp">COMPUTE POWERED <b></b></span>
    </div>
    <div class="ty-barwrap"></div>
    <div class="ty-why ui" aria-live="polite"></div>`;
  let last = null, timer = 0;
  function paint(why = '') {
    const s = mode.liveScore(run);
    $(node, '.ty-n').textContent = int(s.total);
    $(node, '.ty-part.profit b').textContent = int(s.profit);
    $(node, '.ty-part.clout b').textContent = int(s.clout);
    $(node, '.ty-part.cp b').textContent = int(s.cp);
    $(node, '.ty-barwrap').innerHTML = barHTML(s);
    if (last && s.total !== last.total) {
      const d = s.total - last.total;
      const bits = [['PROFIT', s.profit - last.profit], ['CLOUT', s.clout - last.clout], ['COMPUTE', s.cp - last.cp]].filter(([, v]) => v).map(([k, v]) => `${k} ${signed(v)}`);
      const delta = $(node, '.ty-delta');
      delta.textContent = signed(d);
      delta.className = `ty-delta ui ${d > 0 ? 'up' : 'down'}`;
      node.classList.remove('jump');
      void node.offsetWidth;
      node.classList.add('jump');
      $(node, '.ty-why').innerHTML = `${esc(why)}${why ? ': ' : ''}${esc(bits.join(' · '))}`;
      clearTimeout(timer);
      timer = setTimeout(() => { delta.textContent = ''; }, 6000);
    }
    last = s;
  }
  paint();
  return { update: paint, destroy() { clearTimeout(timer); } };
}
