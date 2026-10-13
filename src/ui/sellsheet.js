// THE SELL SHEET (Deal Lab's aftermarket, economy.js): a buyer on the floor wants GPUs
// you hold as spares. Their bid, your spares that fit, what the sale books against what you
// paid and against subletting them, and three moves: SELL, one COUNTER, or NOT NOW. The
// floor keeps running: the buyer leaves when their time is up.

import { el, $, esc, int, usd, round2, mmss } from '../util.js';
import { askOf, buyerLive, counterBuyer, saleMath, sellable, sellTo, sellForEquity, spareFor, money, ECON } from '../modes/economy.js';
import { badge } from '../tycoon/gpu.js';

export function openSellSheet(host, { ctx, run, buyer: b, onClose, onSold }) {
  const m = run.market;
  let offer = round2(askOf(b) + 0.03);
  let said = `Need ${int(b.qty)} ${b.gpu}, ${b.minTerm}+ months${b.delivery > 30 ? ', any delivery' : ''}. I’ll pay ${usd(b.bid)}.`;
  let closed = false;

  const node = el(`
    <div class="bp-scrim sell-scrim">
      <div class="bp-card paper sell-card" role="dialog" aria-modal="true" aria-label="Aftermarket: ${esc(b.firm)}">
        <div class="bp-kicker ui">AFTERMARKET · ${esc((b.kind || 'buyer').toUpperCase())}${b.sector ? ` · ${esc(b.sector.toUpperCase())}` : ''} <span class="sell-t"></span> <button class="ls-x btn sell-x" type="button" aria-label="Back to the floor">✕</button></div>
        <h2 class="bp-h hl-cond">${esc(b.firm)} wants ${int(b.qty)} ${badge(b.gpu)}</h2>
        <p class="sell-say"><b>${esc(b.name)}:</b> “<span class="sell-line"></span>”</p>
        ${b.signal ? `<p class="sell-sig small">${esc(b.signal)}${b.stake > 0 ? ` · you own <b>${(100 * b.stake).toFixed(2)}%</b>` : ''}</p>` : ''}
        <div class="sell-body"></div>
      </div>
    </div>`);
  host.appendChild(node);
  const body = $(node, '.sell-body');

  // Your stake after new shares worth I at their valuation V: (old × V + I) / (V + I).
  const eqAfter = (I) => ((100 * ((b.stake || 0) * b.val + I)) / (b.val + I)).toFixed(2);

  function paint() {
    if (closed) return;
    $(node, '.sell-line').textContent = said;
    const n = sellable(run, b);
    const price = askOf(b);
    if (b.state === 'sold') {
      const s = b.sale;
      body.innerHTML = `<p class="sell-done hl-cond">Sold ${int(s.qty)} ${esc(s.gpu)} at ${usd(s.price)}</p>
        <p class="sell-math"><b>${money(s.vsCost)}</b> against what you paid · <b>${money(s.vsSublet)}</b> against subletting them.</p>
        <button class="btn big spot sell-back" type="button">BACK TO THE FLOOR</button>`;
      return;
    }
    if (!buyerLive(b)) {
      body.innerHTML = `<p class="sell-done hl-cond">${b.state === 'walked' ? 'They walked.' : 'They left the floor.'}</p>
        <button class="btn big ink sell-back" type="button">BACK TO THE FLOOR</button>`;
      return;
    }
    if (n <= 0) {
      const any = run.deals.filter((d) => !d.push && d.gpu === b.gpu && d.qty - (d.alloc || 0) - (d.sold || 0) > 0);
      const why = any.length ? `Your spare ${b.gpu} don’t fit: they need ${b.minTerm}+ months${b.delivery > 30 ? '' : ' and delivery inside 30 days'}.` : `You hold no spare ${b.gpu}.`;
      body.innerHTML = `<p class="sell-hold">${why} Buy a block on the floor and come back before they leave.</p>
        <button class="btn big ink sell-back" type="button">BACK TO THE FLOOR</button>`;
      return;
    }
    const legs = spareFor(run, b);
    const avg = round2(legs.reduce((s, d) => s + d.eff * Math.min(n, d.qty - d.alloc - d.sold), 0) / legs.reduce((s, d) => s + Math.min(n, d.qty - d.alloc - d.sold), 0));
    const sm = saleMath(run, b, price);
    const cm = saleMath(run, b, offer);
    body.innerHTML = `
      <p class="sell-hold">You hold <b>${int(n)} spare ${esc(b.gpu)}</b> that fit${legs.some((d) => d.held) ? ` (${int(legs.filter((d) => d.held).reduce((t, d) => t + d.qty - d.sold, 0))} held from earlier quarters)` : ''} · cost ${usd(avg)} · ${[...new Set(legs.map((d) => d.term))].join('/')} mo left. They take your contract for its term.</p>
      <p class="sell-math">Sell ${int(sm.qty)} at <b>${usd(price)}</b> for ${sm.months} mo: <b>${money(sm.rev).slice(1)}</b> in all · <b class="${sm.vsCost < 0 ? 'neg' : 'pos'}">${money(sm.vsCost)}</b> against what you paid · ${money(sm.vsSublet)} against subletting at −${Math.round(ECON.sublet * 100)}¢${n - sm.qty > 0 ? '' : ''}.</p>
      <div class="ctl-row act-row">
        <button class="btn big spot sell-go" type="button">SELL ${int(sm.qty)} AT ${usd(price)}</button>
        ${b.equityOk && b.val ? `<button class="btn big ink sell-eq" type="button">${b.stake > 0 ? 'INVEST MORE' : 'TAKE EQUITY'} · ${eqAfter(sm.rev)}%</button>` : ''}
      </div>
      ${b.equityOk && b.val ? `<p class="sell-math small">${b.stake > 0 ? `You own <b>${(100 * b.stake).toFixed(2)}%</b> of ${esc(b.firm)}; this compute would make it <b>${eqAfter(sm.rev)}%</b>` : `Short on cash, they'll pay in equity: <b>${eqAfter(sm.rev)}%</b> of ${esc(b.firm)}`}, new shares at their ${money(b.val).slice(1)} valuation, instead of ${money(sm.rev).slice(1)} in cash. No cash comes in (your profit takes the GPUs' cost now); the stake pays only if they're acquired, and is worth nothing if they fail.</p>` : ''}
      ${b.state === 'open' ? `
      <div class="ctl-row num-row sell-num">
        <span class="ctl-l ui">COUNTER</span>
        <button class="step btn" data-d="-0.01" type="button">−1¢</button>
        <output class="offer">${usd(offer)}</output>
        <button class="step btn" data-d="0.01" type="button">+1¢</button>
        <button class="step btn" data-d="0.05" type="button">+5¢</button>
        <button class="btn big default sell-counter" type="button">COUNTER ${usd(offer)}</button>
      </div>
      <p class="sell-math small">At ${usd(offer)}: ${money(cm.vsCost)} against what you paid. One counter: push too far and they walk.</p>` : '<p class="sell-math small">Their final number. Take it, or let them go.</p>'}
      <button class="btn ghost sell-back" type="button">NOT NOW</button>`;
  }

  function close() {
    if (closed) return;
    closed = true;
    node.remove();
    onClose?.();
  }

  node.addEventListener('click', (e) => {
    if (e.target === node) { close(); return; }
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('sell-x') || btn.classList.contains('sell-back')) { close(); return; }
    if (btn.dataset.d) { offer = round2(offer + Number(btn.dataset.d)); ctx.audio.blip?.(1500, 0.03); paint(); return; }
    if (btn.classList.contains('sell-eq')) {
      const sale = sellForEquity(run, b);
      if (sale) { said = 'Deal. Welcome aboard.'; ctx.audio.stamp?.(); onSold?.(sale); }
      paint();
      return;
    }
    if (btn.classList.contains('sell-go')) {
      const sale = sellTo(run, b);
      if (sale) { said = 'Done. Send the paper.'; ctx.audio.stamp?.(); onSold?.(sale); }
      paint();
      return;
    }
    if (btn.classList.contains('sell-counter')) {
      const r = counterBuyer(run, b, offer);
      if (r.line) said = r.line;
      if (r.kind === 'deal') { ctx.audio.stamp?.(); onSold?.(r.sale); } else if (r.kind === 'walk') ctx.audio.buzz?.(); else ctx.audio.tap?.();
      paint();
    }
  });

  let lastT = '';
  paint();
  return {
    buyer: b,
    update() {
      if (closed) return;
      const t = buyerLive(b) ? mmss(Math.max(0, b.endsAt - m.t)) : '';
      if (t !== lastT) { lastT = t; $(node, '.sell-t').textContent = t ? `· ${t}` : ''; }
      if (!buyerLive(b) && body.dataset.state !== b.state) { body.dataset.state = b.state; paint(); }
    },
    close,
  };
}
