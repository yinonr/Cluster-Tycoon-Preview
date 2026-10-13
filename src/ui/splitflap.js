// Split-flap board rows. SOURCE: the board "clattering behind the stage."
// Each cell cycles through a few characters before landing, Solari-style.

import { reducedMotion } from '../util.js';

const GLYPHS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$.+-▲▼→·';

export function createFlapRow(node, width, { onClatter } = {}) {
  node.classList.add('flap-row');
  node.innerHTML = '';
  const cells = [];
  for (let i = 0; i < width; i++) {
    const c = document.createElement('span');
    c.className = 'flap';
    c.textContent = ' ';
    node.appendChild(c);
    cells.push({ el: c, ch: ' ', timer: null });
  }

  function set(text, { instant = false } = {}) {
    const s = String(text).toUpperCase().padEnd(width, ' ').slice(0, width);
    let changed = 0;
    for (let i = 0; i < width; i++) {
      const cell = cells[i];
      const target = s[i];
      if (cell.ch === target && !cell.timer) continue;
      changed++;
      clearTimeout(cell.timer);
      if (instant || reducedMotion()) {
        cell.el.textContent = target; cell.ch = target; cell.timer = null;
        continue;
      }
      let flips = 2 + Math.floor(Math.random() * 4);
      const delay = i * 14;
      const step = () => {
        if (flips-- <= 0) {
          cell.el.textContent = target;
          cell.ch = target;
          cell.el.classList.remove('flipping');
          cell.timer = null;
          return;
        }
        cell.el.classList.remove('flipping');
        void cell.el.offsetWidth;
        cell.el.classList.add('flipping');
        cell.el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        cell.timer = setTimeout(step, 55);
      };
      cell.timer = setTimeout(step, delay);
    }
    if (changed && !instant && onClatter) onClatter(changed);
  }

  function destroy() { cells.forEach((c) => clearTimeout(c.timer)); }
  return { set, destroy };
}
