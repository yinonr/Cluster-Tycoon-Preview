// THE SELL SHEET (Deal Lab's aftermarket, economy.js): a buyer on the floor wants GPUs
// you hold as spares. Their bid, your spares that fit, what the sale books against what you
// paid and against subletting them, and three moves: SELL, one COUNTER, or NOT NOW. The
// floor keeps running: the buyer leaves when their time is up.

import { el, $, esc, int, usd, round2, mmss } from '../util.js';
import { askOf, buyerLive, counterBuyer, saleMath, sellable, sellTo, sellForEquity, spareFor, money, ECON } from '../modes/economy.js';
import { badge } from '../tycoon/gpu.js';
import { buyerStage, opportunity, saleVersion } from '../tycoon/sale-market.js';

export function openSellSheet(host, { ctx, run, buyer: b, onClose, onSold, onSource }) {
  const m = run.market;
  let offer = round2(askOf(b) + 0.03);
  let said = `Need ${int(b.qty)} ${b.gpu}, ${b.minTerm}+ months${b.delivery > 30 ? ', any delivery' : ''}. I’ll pay ${usd(b.bid)}.`;
  let closed = false;
  const v62 = saleVersion(run.tycoon);
  let displayedRevision = b.revisionId;
  const sourcing = () => {
    if (!v62 || !buyerLive(b)) return '';
    const o = opportunity(run, b);
    return `<div class="sale-opportunity"><p class="ui">${buyerStage(b)} · HAVE ${int(o.have)} / ${int(b.qty)} · MISSING ${int(o.missing)}</p><p class="small">${esc(b.reliability)}. Unsigned: quantity, bid or workload may change.</p>${b.changeNote ? `<p class="sale-revision" role="status">${esc(b.changeNote)}</p>` : ''}
      ${o.missing ? `<p class="small">Buy compatible spares below, then return to this buyer. They may leave before you close.</p>${o.supply.slice(0, 3).map((l) => {
        const term = l.terms.find((t) => t >= b.minTerm);
        return `<button class="btn sale-source" data-source="${esc(l.id)}">${esc(l.firm)} · ${int(l.qty)} ${esc(l.gpu)} · min ${int(l.divisible ? l.minQty : l.qty)} · ${usd(m.askAt(l, term))} @${term}M · NEGOTIATE SUPPLY</button>`;
      }).join('') || '<p class="small">No suitable supply posted. Inventory is not guaranteed.</p>'}` : ''}</div>`;
  };

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
    if (displayedRevision !== b.revisionId) {
      displayedRevision = b.revisionId; offer = round2(askOf(b) + 0.03);
      said = b.changeNote || said;
    }
    $(node, '.bp-h').innerHTML = `${esc(b.firm)} wants ${int(b.qty)} ${badge(b.gpu)}`;
    $(node, '.sell-line').textContent = said;
    const n = sellable(run, b);
    const price = askOf(b);
    if (b.state === 'sold') {
      const s = b.sale;
      if (v62) {
        body.innerHTML = `<p class="sell-done hl-cond">SIGNED · ${int(s.qty)} ${badge(s.gpu)} ${s.equity ? 'invested' : 'sold'}</p><p class="sell-math">${s.equity ? `Ownership ${(100 * s.equity.after).toFixed(2)}% · paper investment ${money(s.equity.worth).slice(1)}` : `Contract value ${money(s.rev).slice(1)} · margin ${money(s.vsCost)}`}.</p><p class="small">${s.legs.length} supply block${s.legs.length === 1 ? '' : 's'} assembled. Incremental booked profit ${money(s.vsSublet)} (${Math.round(s.vsSublet / 1000)} profit points). ${s.equity ? 'No cash payment; equity pays only at an exit.' : 'Contracted revenue becomes cash over the service terms.'} Customer delivery and relationship updates settle on the quarter report.</p><button class="btn big spot sell-back">BACK TO THE FLOOR</button>`;
        return;
      }
      body.innerHTML = `<p class="sell-done hl-cond">Sold ${int(s.qty)} ${esc(s.gpu)} at ${usd(s.price)}</p>
        <p class="sell-math"><b>${money(s.vsCost)}</b> against what you paid · <b>${money(s.vsSublet)}</b> against subletting them.</p>
        <button class="btn big spot sell-back" type="button">BACK TO THE FLOOR</button>`;
      return;
    }
    if (!buyerLive(b)) {
      body.innerHTML = `<p class="sell-done hl-cond">${b.state === 'cancelled' ? 'Unsigned request withdrawn.' : b.state === 'walked' ? 'They walked.' : 'They left the floor.'}</p>${b.changeNote ? `<p>${esc(b.changeNote)}</p>` : ''}
        <button class="btn big ink sell-back" type="button">BACK TO THE FLOOR</button>`;
      return;
    }
    if (n <= 0) {
      const any = run.deals.filter((d) => !d.push && d.gpu === b.gpu && d.qty - (d.alloc || 0) - (d.sold || 0) > 0);
      const why = any.length ? `Your spare ${b.gpu} don’t fit: they need ${b.minTerm}+ months${b.delivery > 30 ? '' : ' and delivery inside 30 days'}.` : `You hold no spare ${b.gpu}.`;
      body.innerHTML = `${sourcing()}<p class="sell-hold">${why} Buy a block on the floor and come back before they leave.</p>
        <button class="btn big ink sell-back" type="button">BACK TO THE FLOOR</button>`;
      return;
    }
    const legs = spareFor(run, b);
    let toPrice = n, rates = 0;
    for (const d of legs) { const qty = Math.min(toPrice, d.qty - d.alloc - d.sold); rates += qty * d.eff; toPrice -= qty; }
    const avg = round2(rates / n);
    const sm = saleMath(run, b, price);
    const cm = saleMath(run, b, offer);
    body.innerHTML = `
      ${sourcing()}
      <p class="sell-hold">You hold <b>${int(n)} spare ${esc(b.gpu)}</b> that fit${legs.some((d) => d.held) ? ` (${int(legs.filter((d) => d.held).reduce((t, d) => t + d.qty - d.sold, 0))} held from earlier quarters)` : ''} · cost ${usd(avg)} · ${[...new Set(legs.map((d) => d.term))].join('/')} mo left. They take your contract for its term.</p>
      <p class="sell-math">Sell ${int(sm.qty)} at <b>${usd(price)}</b> for ${sm.months} mo: <b>${money(sm.rev).slice(1)}</b> in all · <b class="${sm.vsCost < 0 ? 'neg' : 'pos'}">${money(sm.vsCost)}</b> against what you paid · ${money(sm.vsSublet)} against subletting at −${Math.round(ECON.sublet * 100)}¢${n - sm.qty > 0 ? '' : ''}.</p>
      ${v62 ? `<p class="small">Supply cost ${money(sm.cost).slice(1)} (financing included). Selected held-capacity carry this quarter ${money(opportunity(run, b).carry).slice(1)}; margin after that carry ${money(opportunity(run, b).netWithCarry)}. Terms ${[...new Set(legs.map((d) => d.term))].join('/')} months: each source sells its remaining term, not just the buyer’s minimum.</p>` : ''}
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
    // A changed proposal needs review; an old counter must never sign revised terms unseen.
    if (displayedRevision !== b.revisionId) { paint(); return; }
    if (btn.classList.contains('sell-x') || btn.classList.contains('sell-back')) { close(); return; }
    if (btn.dataset.source) { const l = m.lot(btn.dataset.source); if (l?.status === 'open') { close(); onSource?.(l); } return; }
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
      if (displayedRevision !== b.revisionId) paint();
      const t = buyerLive(b) ? mmss(Math.max(0, b.endsAt - m.t)) : '';
      if (t !== lastT) { lastT = t; $(node, '.sell-t').textContent = t ? `· ${t}` : ''; }
      if (!buyerLive(b) && body.dataset.state !== b.state) { body.dataset.state = b.state; paint(); }
    },
    close,
  };
}
