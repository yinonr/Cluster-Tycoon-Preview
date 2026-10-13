// THE BOARD. SOURCE: "a big analog clock, holds the market's totals" ... "On
// the board, a fill goes up: the lot and the price, in true numbers, with no
// names." Split-flap rates on the left, the clock in the middle, totals right.

import { BOARD_ORDER } from '../data/gpus.js';
import { createFlapRow } from './splitflap.js';
import { clockSVG, setClock } from './clock.js';
import { $, mmss, int, wallClock } from '../util.js';
import { FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR } from '../config.js';

const RATE_W = 16;
const TOT_W = 18;

export function createBoard(node, { market, mandate, audio }) {
  node.innerHTML = `
    <div class="board">
      <div class="board-col board-rates">
        <div class="board-h ui">RATE · $/GPU-HR</div>
        <div class="rows"></div>
      </div>
      <div class="board-col board-clock">
        ${clockSVG()}
        <div class="bell-in ui">BELL IN <b class="num">4:00</b></div>
      </div>
      <div class="board-col board-totals">
        <div class="board-h ui">MARKET TOTALS</div>
        <div class="rows"></div>
      </div>
    </div>`;

  let lastClatter = 0;
  const onClatter = (n) => {
    const now = performance.now();
    if (now - lastClatter < 700) return;
    lastClatter = now;
    audio.clatter(Math.min(18, 4 + n), 0.4);
  };

  const rateRows = BOARD_ORDER.map((id) => {
    const row = document.createElement('div');
    if (id === mandate.gpu) row.classList.add('hot');
    $(node, '.board-rates .rows').appendChild(row);
    return { id, flap: createFlapRow(row, RATE_W, { onClatter }) };
  });
  const totRows = Array.from({ length: 5 }, (_, i) => {
    const row = document.createElement('div');
    if (i === 4) row.classList.add('fill-row');
    $(node, '.board-totals .rows').appendChild(row);
    return createFlapRow(row, TOT_W, { onClatter });
  });

  const clock = $(node, '.clock');
  const bellIn = $(node, '.bell-in b');

  function rateText(id) {
    const v = market.bench[id];
    const d = Math.round((v - market.open[id]) * 100);
    const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '·';
    const chg = d === 0 ? '   ' : `.${String(Math.abs(d)).padStart(2, '0')}`;
    return `${id.padEnd(6)} ${v.toFixed(2)} ${arrow}${chg}`;
  }

  function refreshRates(instant = false) {
    rateRows.forEach((r) => r.flap.set(rateText(r.id), { instant }));
  }

  function refreshTotals(instant = false) {
    const offers = market.liveLots().length;
    const fills = market.fills.length;
    const traded = market.fills.reduce((s, f) => s + f.qty, 0);
    const last = market.fills[market.fills.length - 1];
    totRows[0].set(`OFFERS POSTED ${String(offers).padStart(4)}`, { instant });
    totRows[1].set(`FILLS ${String(fills).padStart(12)}`, { instant });
    totRows[2].set(`GPUS TRADED ${int(traded).padStart(6)}`, { instant });
    totRows[3].set('LAST FILL', { instant });
    totRows[4].set(last ? `${int(last.qty)} ${last.gpu} ${last.site} ${last.rate.toFixed(2)}` : '—', { instant });
  }

  let lastLabel = '';
  function updateClock() {
    const wc = wallClock(market.t, market.duration, FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR);
    setClock(clock, wc.mins);
    const left = mmss(market.timeLeft());
    if (left !== lastLabel) {
      lastLabel = left;
      bellIn.textContent = left;
      node.classList.toggle('last-call', market.timeLeft() <= 30);
    }
  }

  refreshRates(true);
  refreshTotals(true);
  updateClock();

  let tickN = 0;
  const offs = [
    market.on('tick', () => { if (++tickN % 2 === 0) refreshRates(); }),
    market.on('reprice', () => refreshRates()),
    market.on('fill', () => refreshTotals()),
    market.on('lot:added', () => refreshTotals()),
    market.on('lot:gone', () => refreshTotals()),
    market.on('lot:status', () => refreshTotals()),
  ];

  return {
    updateClock,
    destroy() {
      offs.forEach((off) => off());
      rateRows.forEach((r) => r.flap.destroy());
      totRows.forEach((r) => r.destroy());
    },
  };
}
