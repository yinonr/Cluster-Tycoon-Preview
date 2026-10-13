// THE ROSTRUM: the lot call, docked so you can bid while you haggle elsewhere.

import { $, esc, int, usd } from '../util.js';
import { BRAND } from '../config.js';

export function createRostrum(dock, { ctx, run, onWin }) {
  const m = run.market;
  const md = run.mandate;
  const mode = ctx.mode;
  let auction = null;
  let offs = [];
  let hideTimer = null;

  function start(a) {
    auction = a;
    const lot = a.lot;
    clearTimeout(hideTimer);
    dock.hidden = false;
    dock.className = 'rostrum-dock arrive';
    dock.innerHTML = `
      <div class="ros-head">
        <span class="ui">THE ROSTRUM · LOT ${lot.number}</span>
        <span class="ros-mc ui">${esc(BRAND.mcName ? `${BRAND.mcName.toUpperCase()} CALLING` : 'THE AUCTIONEER')}</span>
      </div>
      <div class="ros-lot">${int(lot.qty)} × ${lot.gpu} · ${esc(lot.site.city)} · ${lot.baseTerm} mo · ${esc(lot.deliveryLabel.toLowerCase())} · HOUSE ✓</div>
      <div class="ros-bid">
        <div class="ros-high"><span class="ui">HIGH BID</span><b class="num">${usd(lot.opening)}</b><span class="ros-lead ui">OPENING</span></div>
        <div class="ros-phase hl-cond">Opening at ${usd(lot.opening)}</div>
      </div>
      <div class="ros-act">
        <button class="btn big spot paddle" type="button">RAISE PADDLE ${usd(a.nextBid())}</button>
        <button class="btn jump" type="button">+5¢</button>
      </div>
      <div class="ros-note ui">Your paddle: ${run.paddle} · target ${usd(md.target)} · walk ${usd(md.walk)}</div>`;
    $(dock, '.paddle').addEventListener('click', () => bid(0.01));
    $(dock, '.jump').addEventListener('click', () => bid(0.05));
    offs.push(a.on('bid', paint), a.on('phase', paint), a.on('sold', sold));
    paint();
  }

  function bid(inc) {
    if (!auction || auction.state !== 'calling') return;
    if (!mode.canBid(run)) return;
    if (auction.playerBid(inc)) ctx.audio.tap();
  }

  function paint() {
    if (!auction) return;
    const a = auction;
    const high = a.leader ? a.high : a.lot.opening;
    const b = $(dock, '.ros-high b');
    b.textContent = usd(high);
    b.className = `num ${high <= md.target ? 'ok' : high <= md.walk ? 'warn' : 'no'}`;
    $(dock, '.ros-lead').textContent = a.leader === 'you' ? 'YOUR PADDLE' : a.leader === 'rival' ? `PADDLE ${a.rivalPaddle}` : 'OPENING';
    dock.classList.toggle('leading', a.leader === 'you');
    const phaseText = { open: a.leader ? `${usd(high)}. Do I hear more?` : `Opening at ${usd(a.lot.opening)}`, once: 'Going once…', twice: 'Going twice…', sold: 'Sold.' }[a.phase];
    $(dock, '.ros-phase').textContent = phaseText;
    dock.classList.toggle('hammer', a.phase === 'once' || a.phase === 'twice');
    const paddle = $(dock, '.paddle');
    const filled = !mode.canBid(run);
    paddle.disabled = a.leader === 'you' || filled;
    $(dock, '.jump').disabled = a.leader === 'you' || filled;
    paddle.textContent = filled ? (mode.endsOnFill ? 'NEED SHEET FILLED' : 'CAN\'T CARRY THIS LOT') : a.leader === 'you' ? 'YOU HOLD THE BID' : `RAISE PADDLE ${usd(a.nextBid())}`;
    if (a.phase === 'once' || a.phase === 'twice') ctx.audio.blip(a.phase === 'once' ? 520 : 440, 0.05);
  }

  function sold({ winner, price }) {
    const a = auction;
    const lot = a.lot;
    ctx.audio.stamp();
    offs.forEach((o) => o()); offs = [];
    if (winner === 'you') {
      dock.innerHTML = `<div class="ros-sold mine"><span class="stamp spot">SOLD</span><span>to paddle ${run.paddle} at ${usd(price)}</span></div>`;
      onWin(mode.auctionDeal(run, lot, price));
    } else if (winner === 'rival') {
      m.recordFill({ gpu: lot.gpu, qty: lot.qty, site: lot.site.code, term: lot.baseTerm, rate: price, by: 'rival' });
      dock.innerHTML = `<div class="ros-sold"><span class="stamp">SOLD</span><span>to paddle ${a.rivalPaddle} at ${usd(price)}. Should’ve raised.</span></div>`;
      ctx.audio.buzz();
    } else {
      dock.innerHTML = '<div class="ros-sold"><span class="stamp ink">PASSED</span><span>No bids. The lot goes back to the house.</span></div>';
    }
    m.auction = null;
    auction = null;
    hideTimer = setTimeout(() => { dock.hidden = true; }, 4200);
  }

  const off = m.on('auction:start', start);
  return {
    destroy() { off(); offs.forEach((o) => o()); clearTimeout(hideTimer); },
  };
}
