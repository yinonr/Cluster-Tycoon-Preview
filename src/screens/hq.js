// THE OFFICE (Venture Mode). The board memo: where the company stands, the
// word on the floor, two or three objectives to pick from, and the investors'
// Compute SAFE offers. One decision: which objective takes you to the floor.
// Everything here reads the venture's state; every change goes through the
// save (ctx.venture), so a reload lands back where you were.

import { C } from '../venture/constants.js';
import { capacity, lineLeft, burnAt, capTotal } from '../venture/state.js';
import { preview } from '../venture/economy.js';
import { EVENTS } from '../venture/events.js';
import { $, $$, esc, int, usd, usdM } from '../util.js';

const M = (n) => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
const REGIME = {
  LOOSENING: 'Compute is getting cheaper every quarter.',
  STEADY: 'Compute prices are drifting a little lower.',
  TIGHTENING: 'Compute is getting dearer every quarter.',
};
const KIND = { cash: 'cash', capital: 'capital desk', safe: 'SAFE' };

export default function hq(root, ctx) {
  const store = ctx.venture;
  let armed = null; // a two-click action waiting for its second click

  function render() {
    const s = store.state;
    if (!s) { setTimeout(() => ctx.go('ad')); return; }
    if (!['memo', 'briefed'].includes(s.phase)) { setTimeout(() => ctx.go('quarter')); return; }
    const memo = s.memo;
    const q = s.q;
    const capNow = capacity(s, q).serve;
    const capNext = capacity(s, q + 1).serve;
    const forecast = s.demand * (1 + C.growth);
    const idle = preview(s, 0); // the close if you sign nothing and serve all
    const thr = C.thresholds[s.model.level - 1];
    const prog = thr ? Math.min(1, s.model.progress / thr) : 1;
    const inForce = [
      s.pending.glut && 'GLUT: a second wind-down seller is on this floor.',
      (s.pending.demand || s.pending.crunch) && 'SURGE: customers are shopping for capacity. Serve them all, with capacity to spare, and you win new ones.',
      s.pending.crunch && 'CRUNCH: most blocks are half size, and rivals move faster.',
      s.pending.power && 'POWER: most blocks deliver 45 days later.',
      s.pending.enterprise && 'ENTERPRISE: the pilot pays 1.5×.',
      s.priceMult < 1 && `RIVAL: your price is ${Math.round((1 - s.priceMult) * 100)}% lower until your next launch.`,
      s.spread > 0 && `CREDIT: the capital desk charges ${usd(s.spread)} more on every financed hour.`,
    ].filter(Boolean);
    const chosen = memo.chosen;
    const rumor = memo.rumor && EVENTS[memo.rumor];
    const taken = new Set(s.book.filter((e) => e.src === 'safe').map((e) => e.id));
    const book = s.book.filter((e) => e.endQ > q).sort((a, b) => a.endQ - b.endQ);
    const notices = store.notices;

    root.innerHTML = `
      <div class="hq">
        ${notices.length ? `<div class="vnotice ui" role="status">${notices.map((n) => `<p>${esc(n.text)} <button class="linkish dismiss" data-id="${n.id}" type="button">OK</button></p>`).join('')}</div>` : ''}
        <header class="hq-head">
          <div class="hq-kicker ui">THE OFFICE · ${esc(s.player.firm.toUpperCase())}${s.dev ? ' · DEV VENTURE (NOT SAVED)' : ''}</div>
          <h1 class="hl-cond hq-q">Quarter ${q} <span>of ${C.quarters}</span></h1>
          <ul class="hq-quarters" aria-label="Quarters">${Array.from({ length: C.quarters }, (_, i) => {
            const r = s.history[i];
            const cls = i + 1 === q ? 'now' : r ? (r.objective && r.objective.met ? 'met' : 'miss') : '';
            return `<li class="${cls}" title="Q${i + 1}${r ? `: ${r.objective ? `${r.objective.type} ${r.objective.met ? 'met' : 'missed'}` : 'no objective'}` : ''}">Q${i + 1}</li>`;
          }).join('')}</ul>
        </header>

        ${lastBand(s)}
        <div class="hq-grid">
          <article class="memo paper">
            <div class="memo-h">
              <div class="caps memo-from">From the board · Q${q} memo</div>
              <div class="caps memo-to">To: ${esc(s.player.name || 'the founder')}</div>
            </div>
            <hr class="rule-double">
            ${q === 1 && !s.history.length ? `<p class="memo-how">Six quarters, then the company is sold and you keep your stake. Each quarter: pick one objective, trade for it on the floor (anything else you buy there is on you), then split your compute between serving customers and training the next model. Cash runs out once and the capital desk bridges you, for 40%. Twice and it's over.</p>` : ''}
            <ul class="memo-situation">
              <li><b>Demand</b> ${int(s.demand)} GPU-eq, about ${int(forecast)} next quarter. You have <b>${int(capNow)}</b> serving now and ${int(capNext)} contracted for next quarter.</li>
              <li><b>Cash</b> ${M(s.cash)}. Sign nothing today and you close the quarter at <b class="${idle.cashEnd < 0 ? 'neg' : ''}">${M(idle.cashEnd)}</b>${idle.cashEnd < 0 ? (s.bridges ? ': that would be the end.' : ': the capital desk would bridge you, for 40% of the company.') : '.'}</li>
              <li><b>Model</b> v${s.model.level}${thr ? `: ${int(s.model.progress)} of ${int(thr)} training units to v${s.model.level + 1}` : ' (the last one)'}. <span class="bar"><i style="width:${(prog * 100).toFixed(0)}%"></i></span></li>
              <li><b>Market</b> ${esc(s.regime.toLowerCase())}. ${REGIME[s.regime] || ''} H100 ${usd(s.market.H100)} · H200 ${usd(s.market.H200)} · B200 ${usd(s.market.B200)} on the board.</li>
              ${inForce.map((x) => `<li class="force"><b>In force</b> ${esc(x)}</li>`).join('')}
              ${rumor ? `<li class="rumor"><b>Word on the floor</b> “${esc(rumor.word)}”</li>` : ''}
            </ul>

            <h2 class="memo-sec caps">${chosen ? 'Your objective this quarter' : 'Pick this quarter’s objective'}</h2>
            <div class="objectives">
              ${memo.options.map((o) => objectiveCard(o, chosen)).join('')}
            </div>
            ${chosen ? '<button class="btn big spot to-floor" type="button">TO THE FLOOR →</button>' : `<button class="linkish skip" type="button">${armed === 'skip' ? 'Sure? The board marks it missed. Click again.' : 'Skip the floor this quarter'}</button>`}
          </article>

          <aside class="hq-side">
            <section class="dash paper">
              <div class="dash-h caps">The company</div>
              <dl class="dash-grid">
                <dt>Cash</dt><dd class="num">${M(s.cash)}</dd>
                <dt>Capital line</dt><dd class="num">${M(lineLeft(s))} free</dd>
                <dt>Team</dt><dd class="num">${M(burnAt(q))} a quarter</dd>
                <dt>You own</dt><dd class="num">${s.capTable.founderPct.toFixed(1)}%</dd>
                ${worthRow(s)}
                <dt>Board</dt><dd>${s.met} met · ${s.missed} missed</dd>
              </dl>
              ${s.capTable.holders.length ? `<ul class="cap-list">${s.capTable.holders.map((h) => `<li>${esc(h.name)} <b>${h.pct.toFixed(1)}%</b></li>`).join('')}<li class="muted">Total ${capTotal(s.capTable).toFixed(1)}%</li></ul>` : ''}
            </section>

            <section class="offers paper">
              <div class="dash-h caps">Investor offers · Compute SAFE</div>
              ${memo.offers.length ? memo.offers.map((o) => offerCard(o, taken.has(o.id), armed === o.id)).join('') : '<p class="muted small">No offers this quarter.</p>'}
              <p class="muted small">GPUs now, no cash, for a slice of the company. Also at the investor desk on the floor until the bell.</p>
            </section>

            <section class="book paper">
              <div class="dash-h caps">Contract book</div>
              ${book.length ? `<table class="book-t"><thead><tr><th>GPUs</th><th>Rate</th><th>Runs</th><th>Pay</th></tr></thead><tbody>${book.map((e) => `<tr><td>${int(e.qty)} ${e.gpu}</td><td class="num">${e.src === 'safe' ? `${e.equityPct}%` : usd(e.rate + (e.financed ? e.fee + s.spread : 0))}</td><td>Q${e.startQ}–Q${e.endQ - 1}${e.startQ > q ? ' <i>later</i>' : ''}</td><td>${KIND[e.src] || e.src}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Nothing under contract.</p>'}
            </section>
          </aside>
        </div>
      </div>`;

    $$(root, '.pick').forEach((b) => b.addEventListener('click', () => {
      ctx.audio.slap();
      store.pickObjective(b.dataset.type);
      if (store.state.phase !== 'briefed') { render(); return; }
      toFloor();
    }));
    $(root, '.to-floor')?.addEventListener('click', toFloor);
    $(root, '.skip')?.addEventListener('click', () => {
      if (armed !== 'skip') { armed = 'skip'; render(); return; }
      armed = null;
      store.skipFloor();
      ctx.go('quarter');
    });
    $$(root, '.take-safe').forEach((b) => b.addEventListener('click', () => {
      if (armed !== b.dataset.id) { armed = b.dataset.id; ctx.audio.tap(); render(); return; }
      armed = null;
      store.acceptSafe(b.dataset.id);
      ctx.audio.stamp();
      render();
    }));
    $$(root, '.dismiss').forEach((b) => b.addEventListener('click', () => { store.dismiss(b.dataset.id); if (b.dataset.id === 'other-tab' || b.dataset.id === 'conflict') store.reload(); render(); }));
  }

  // Q1 gets the board's letter and the lobby; after that, straight to the floor.
  function toFloor() {
    if (!ctx.ventureRun()) { render(); return; }
    ctx.go(store.state.q === 1 ? 'sheet' : 'floor');
  }

  // Another tab wrote the company: show where it is now (with the notice).
  const onStore = (e) => { if (e.key === 'hsc-venture-v1') render(); };
  window.addEventListener('storage', onStore);
  render();
  return () => window.removeEventListener('storage', onStore);
}

function objectiveCard(o, chosen) {
  const on = chosen === o.type;
  const off = chosen && !on;
  const pay = o.type === 'PILOT'
    ? `${M(o.bonus)} up front + ${int(C.objectives.pilot.demandPerGpu * o.qty)} GPU-eq of demand`
    : `Board tranche ${M(C.tranche * (C.trancheQ.base + C.trancheQ.k * 0.4))} at target, up to ${M(C.tranche * (C.trancheQ.base + C.trancheQ.k))} for a great price`;
  return `
    <div class="obj ${on ? 'on' : ''} ${off ? 'off' : ''}">
      <div class="obj-type hl-cond">${o.type}</div>
      <p class="obj-brief">${esc(o.brief)}</p>
      <div class="obj-need ui">${int(o.qty)} × ${o.gpu}${o.accept.length > 1 ? ` (${o.accept.filter((g) => g !== o.gpu).join(', ')} ok)` : ''} · within ${o.deliveryDays} days · ${o.minTerm}+ months</div>
      <div class="obj-pay small">${esc(pay)}</div>
      ${chosen ? (on ? '<div class="obj-stamp stamp spot" style="--rot:-7deg">CHOSEN</div>' : '') : `<button class="btn ink pick" data-type="${o.type}" type="button">TAKE ${o.type}</button>`}
    </div>`;
}

function offerCard(o, taken, armed) {
  return `
    <div class="sf-offer ${taken ? 'taken' : ''}">
      <div class="sf-offer-who"><i class="lanyard-dot side-money"></i> <b>${esc(o.investor)}</b></div>
      <div class="sf-offer-what">${int(o.qty)} ${o.gpu} for ${o.termQ} quarters, ${o.startQ === o.q ? 'live this quarter' : 'from next quarter'} <span class="muted">(about ${usdM(o.computeValue)} of compute)</span></div>
      <div class="sf-offer-price">for <b>${o.equityPct}%</b> of the company</div>
      ${taken ? '<div class="sf-offer-taken stamp ink" style="--rot:-5deg">SIGNED</div>' : `<button class="btn take-safe ${armed ? 'spot' : ''}" data-id="${o.id}" type="button">${armed ? `SURE? GIVE ${o.equityPct}%` : 'TAKE THE SAFE'}</button>`}
    </div>`;
}

// Last quarter, in one band at the top of the office (the full report folds out).
function lastBand(s) {
  const r = s.lastReport;
  if (!r || r.q !== s.q - 1) return '';
  const c = r.cash;
  const o = r.objective;
  const prev = s.history.length > 1 ? s.history[s.history.length - 2].worth : null;
  const d = r.worth && prev ? r.worth.stake - prev.stake : null;
  // The quarter's consequences, as chips: good news green, bad news red.
  const chips = [
    o ? { t: `${o.type} ${o.met ? `MET · board ${M(o.payoff)}` : 'MISSED'}`, k: o.met ? 'good' : 'bad' } : { t: 'NO OBJECTIVE', k: 'bad' },
    r.launchedTo ? { t: `MODEL v${r.launchedTo} LAUNCHED`, k: 'good' } : null,
    r.word >= 0.005 ? { t: `+${Math.round(100 * r.word)}% CUSTOMERS (SURGE)`, k: 'good' } : null,
    r.unserved >= 1 ? { t: `${int(r.churned)} GPU-EQ LOST TO RIVALS`, k: 'bad' } : null,
    r.bridged ? { t: 'BRIDGED FOR 40%', k: 'bad' } : null,
    { t: `CASH ${M(c.start)} → ${M(c.end)}`, k: c.end >= c.start ? 'good' : '' },
  ].filter(Boolean);
  return `
    <details class="last-q paper">
      <summary>
        <span class="ui last-k">QUARTER ${r.q} REPORT</span>
        ${r.worth ? `<span class="last-stake">Your stake ≈ <b>${M(r.worth.stake)}</b>${d != null ? ` <i class="${d >= 0 ? 'gain' : 'neg'}">${d >= 0 ? '▲' : '▼'} ${M(Math.abs(d))}</i>` : ''}</span>` : ''}
        <span class="last-chips">${chips.map((x) => `<span class="chip-r ${x.k}">${esc(x.t)}</span>`).join('')}</span>
        ${r.event ? `<span class="last-next">Next: ${esc(r.event.head)}. ${esc(r.event.line)}</span>` : ''}<span class="ui last-more">FULL REPORT ▾</span></summary>
      <table class="ledger"><tbody>
        <tr><td>Cash at the open</td><td class="num">${M(c.start)}</td></tr>
        ${c.deposits ? `<tr><td>Deposits at signing</td><td class="num neg">−${M(c.deposits)}</td></tr>` : ''}
        ${c.payoff ? `<tr><td>The board</td><td class="num gain">+${M(c.payoff)}</td></tr>` : ''}
        <tr><td>Revenue</td><td class="num gain">+${M(c.revenue)}</td></tr>
        <tr><td>Compute</td><td class="num neg">−${M(c.payments)}</td></tr>
        <tr><td>Team</td><td class="num neg">−${M(c.burn)}</td></tr>
        ${c.bridge ? `<tr><td>Bridge (for 40%)</td><td class="num gain">+${M(c.bridge)}</td></tr>` : ''}
        <tr class="total"><td>Cash at the close</td><td class="num">${M(c.end)}</td></tr>
      </tbody></table>
      <ul class="q-lines">${r.lines.filter((l) => !l.startsWith('Cash ') && !l.startsWith('Next quarter')).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    </details>`;
}

// If you sold today: what the company would fetch, and your stake, against last quarter.
function worthRow(s) {
  const h = s.history.filter((r) => r.worth);
  if (!h.length) return '';
  const now = h[h.length - 1].worth;
  const prev = h.length > 1 ? h[h.length - 2].worth : null;
  const d = prev ? now.stake - prev.stake : 0;
  return `<dt>Sold today</dt><dd class="num">≈ ${M(now.valuation)}</dd>
    <dt>Your stake</dt><dd class="num worth"><b>≈ ${M(now.stake)}</b>${prev ? ` <span class="${d >= 0 ? 'gain' : 'neg'}">${d >= 0 ? '▲' : '▼'} ${M(Math.abs(d))}</span>` : ''}</dd>`;
}
