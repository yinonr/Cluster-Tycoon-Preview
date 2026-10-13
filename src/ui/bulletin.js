// Bulletins from the rostrum: a band that slides across the hall.

import { BRAND } from '../config.js';
import { $, esc } from '../util.js';

export function createBulletins(node, { audio }) {
  const queue = [];
  let showing = false;
  let timer = null;

  function next() {
    const b = queue.shift();
    if (!b) { showing = false; node.hidden = true; return; }
    showing = true;
    node.hidden = false;
    node.className = `bulletin tone-${b.tone || 'flat'}`;
    node.innerHTML = `
      <div class="bl-kicker ui">FROM THE ROSTRUM${BRAND.mcName ? ` · ${esc(BRAND.mcName.toUpperCase())}` : ''}</div>
      <div class="bl-hl hl-cond">${esc(b.headline)}</div>
      ${b.sub ? `<div class="bl-sub ui">${esc(b.sub)}</div>` : ''}`;
    void node.offsetWidth;
    node.classList.add('in');
    audio.alert();
    timer = setTimeout(() => {
      node.classList.remove('in');
      node.classList.add('out');
      timer = setTimeout(next, 320);
    }, 3600);
  }

  node.addEventListener('click', () => { clearTimeout(timer); node.classList.remove('in'); next(); });

  return {
    push(b) { queue.push(b); if (!showing) next(); },
    destroy() { clearTimeout(timer); },
  };
}

export function showIntel(host, info, { onClose } = {}) {
  const node = document.createElement('div');
  node.className = 'intel-scrim';
  node.innerHTML = `
    <div class="intel paper" role="dialog" aria-modal="true">
      <div class="intel-kicker ui">${esc(info.kicker || '')}</div>
      <div class="intel-title hl">${esc(info.title)}</div>
      ${info.body.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${info.locked ? '<p class="intel-locked"><span class="stamp ink">NEXT SESSION</span></p>' : ''}
      <button class="btn ink close" type="button">BACK TO THE FLOOR</button>
    </div>`;
  host.appendChild(node);
  const close = () => { node.remove(); window.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  $(node, '.close').addEventListener('click', close);
  node.addEventListener('click', (e) => { if (e.target === node) close(); });
  $(node, '.close').focus({ preventScroll: true });
  return { close };
}
