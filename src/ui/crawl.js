// Amber LED news crawl under the board. Rebuilt on each pass so it always
// carries the latest rates, bulletins and fills.

import { BOARD_ORDER } from '../data/gpus.js';
import { esc, int, reducedMotion } from '../util.js';
import { BRAND } from '../config.js';

export function createCrawl(node, { market }) {
  node.innerHTML = '<div class="crawl-track"></div>';
  const track = node.firstElementChild;

  function items() {
    const out = [];
    out.push(`<span class="c-tag">${esc(BRAND.wordmark)}</span>`);
    for (const id of BOARD_ORDER) {
      const v = market.bench[id];
      const d = v - market.open[id];
      const cls = d > 0.004 ? 'up' : d < -0.004 ? 'down' : '';
      out.push(`<span class="c-rate ${cls}">${id} ${v.toFixed(2)} ${d > 0.004 ? '▲' : d < -0.004 ? '▼' : ''}</span>`);
    }
    market.bulletins.slice(-3).forEach((b) => out.push(`<span class="c-news">● ${esc(b.headline)}</span>`));
    market.fills.slice(-3).forEach((f) => out.push(`<span class="c-fill">FILL ${int(f.qty)} ${f.gpu} ${f.site} ${f.term}M ${f.rate.toFixed(2)}</span>`));
    if (!market.bulletins.length) out.push('<span class="c-news">● MARKET OPEN · EVERY LOT HOUSE CONFIRMED</span>');
    return out.join('<span class="c-sep">◆</span>');
  }

  function build() {
    const html = items();
    track.innerHTML = `<span class="crawl-run">${html}</span><span class="crawl-run" aria-hidden="true">${html}</span>`;
    const w = track.firstElementChild.offsetWidth || 1600;
    track.style.animationDuration = `${Math.max(18, w / 70)}s`;
  }

  build();
  if (reducedMotion()) track.style.animation = 'none';
  track.addEventListener('animationiteration', build);
  return { destroy() { track.removeEventListener('animationiteration', build); } };
}
