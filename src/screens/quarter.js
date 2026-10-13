// THE QUARTER (Venture Mode). Three views of one screen, by phase:
//   close   the TRAIN ◄► SERVE lever, with the close previewed live (economy.preview)
//   report  what happened: the board, customers, compute, the team, cash, next quarter's card
//   over    the exit (or SOLD FOR PARTS): a magazine front page, your stake, the cap table
// Closing the quarter is one write (ctx.venture.closeQuarter), so a reload or a
// second click can't close it twice.

import { C } from '../venture/constants.js';
import { preview } from '../venture/economy.js';
import { optionOf } from '../venture/objectives.js';
import { capTotal } from '../venture/state.js';
import { $, $$, esc, int, usd } from '../util.js';

const M = (n) => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
const pct = (x) => `${Math.round(x * 100)}%`;
const LEVER = ['SERVE ALL', '25% TRAIN', 'HALF AND HALF', '75% TRAIN', 'TRAIN ALL'];

// Fictional front-page lines for the exit, by tier.
const HEADLINE = {
  'CATEGORY LEADER': (f) => `${f} IS THE ONE TO BEAT`,
  'BIDDING WAR': (f) => `THREE BUYERS FIGHT OVER ${f}`,
  'STRATEGIC SALE': (f) => `${f} SOLD TO A STRATEGIC`,
  'TUCK-IN': (f) => `${f} TUCKED INTO A BIGGER LAB`,
  'ACQUI-HIRED': (f) => `${f} TEAM ACQUI-HIRED`,
  'SOLD FOR PARTS': (f) => `${f} SOLD FOR PARTS`,
};

export default function quarter(root, ctx) {
  const store = ctx.venture;
  let share = null;

  function render() {
    const s = store.state;
    if (!s) { setTimeout(() => ctx.go('ad')); return; }
    if (['memo', 'briefed'].includes(s.phase)) { setTimeout(() => ctx.go('hq')); return; }
    if (s.phase === 'floor') { store.recover(); render(); return; }
    root.innerHTML = '';
    if (s.phase === 'close') closeView(s);
    else if (s.phase === 'report') reportView(s, s.lastReport);
    else exitView(s);
    window.scrollTo(0, 0);
  }

  // ---- close: the lever ----------------------------------------------------------
  function closeView(s) {
    if (share == null) share = suggest(s);
    const pv = preview(s, share);
    const obj = optionOf(s.memo, s.memo && s.memo.chosen);
    const res = s.floor && s.floor.result;
    const thr = pv.next;
    root.innerHTML = `
      <div class="qtr">
        <header class="q-head">
          <div class="q-kicker ui">${esc(s.player.firm.toUpperCase())} · END OF QUARTER ${s.q} OF ${C.quarters}</div>
          <h1 class="hl-cond q-title">Close the quarter</h1>
        </header>
        <section class="q-board paper">
          ${obj && res ? `
            <div class="q-obj ${pv.met ? 'met' : 'miss'}">
              <div class="q-stamp stamp ${pv.met ? 'spot' : ''} stamp-in" style="--rot:${pv.met ? '-8deg' : '6deg'}">${pv.met ? 'MET' : 'MISSED'}</div>
              <span class="hl-cond">${obj.type} ${pv.met ? 'MET' : 'MISSED'}</span>
              <span>${res.secured > obj.qty ? `${int(res.secured)} GPUs against a need of ${int(obj.qty)}` : `${int(res.secured)} of ${int(obj.qty)} secured`}${res.safeQty ? ` (${int(res.safeQty)} by SAFE)` : ''}${pv.met && obj.type !== 'PILOT' ? `, priced at ${pct(res.q)} quality` : ''}.</span>
              <b>${pv.met ? `Board pays ${M(pv.payoff)}` : 'No board money; the exit multiple takes 6% off'}</b>
              ${pv.met && obj.type !== 'PILOT' && res.q < 0.95 ? `<span class="small muted">Bought 15¢ under target, the same need would have paid ${M(C.tranche * (C.trancheQ.base + C.trancheQ.k))}.</span>` : ''}
            </div>` : '<div class="q-obj miss"><span class="hl-cond">NO OBJECTIVE</span><span>You skipped the floor.</span><b>The exit multiple takes 6% off</b></div>'}
        </section>
        <section class="q-lever paper">
          <h2 class="caps">Train ◄► serve</h2>
          <p class="small">Your compute either serves customers (revenue now) or trains the next model (price and demand later). Serving capacity nobody asked for trains anyway, at ${pct(C.idleTrain)}.</p>
          <div class="lever" role="radiogroup" aria-label="Share of compute to training">
            ${C.levers.map((x, i) => `<button class="chip lev ${x === share ? 'on' : ''}" role="radio" aria-checked="${x === share}" data-share="${x}" type="button">${LEVER[i]}</button>`).join('')}
          </div>
          <dl class="pv">
            <dt>Customers</dt><dd>Serve <b>${int(pv.served)}</b> of ${int(pv.demand)} GPU-eq${pv.unserved >= 1 ? ` · <span class="neg">${int(pv.unserved)} unserved, ${int(pv.churned)} leave for rivals</span>` : ''}</dd>
            <dt>Next quarter</dt><dd>${pv.word >= 0.005 ? `<b class="gain">Word of mouth +${(100 * pv.word).toFixed(1)}%</b> (${pct(pv.headroom)} capacity to spare) · ` : pv.reliable ? 'Everyone served; keep capacity to spare and word gets around · ' : ''}about <b>${int(pv.demandNext)}</b> GPU-eq of demand${s.q < C.quarters ? '' : ' (the buyer sees it)'}</dd>
            <dt>Revenue</dt><dd class="num">${M(pv.revenue)} <span class="muted">at ${usd(pv.price)}/GPU-hr</span></dd>
            <dt>Compute</dt><dd class="num">−${M(pv.payments)}</dd>
            <dt>Team</dt><dd class="num">−${M(pv.burn)}</dd>
            <dt>Model</dt><dd>${pv.level > s.model.level ? `<b class="gain">v${pv.level} LAUNCHES</b>: price up, demand × ${C.launchJump}` : thr ? `+${int(pv.trained)} training units · ${int(pv.progress)} of ${int(thr)} to v${pv.level + 1}` : 'v4: nothing left to train'}</dd>
            <dt>Cash at close</dt><dd class="num big ${pv.cashEnd < 0 ? 'neg' : ''}">${M(pv.cashEnd)}</dd>
          </dl>
          ${pv.shortfall ? `<p class="q-warn">${pv.soldForParts ? 'Cash runs out and there is no second bridge: the company would be <b>SOLD FOR PARTS</b>.' : `Cash runs out: the capital desk bridges you ${M(C.bridge.cash)} for ${C.bridge.equityPct}% of the company.`}</p>` : ''}
          <button class="btn big spot do-close" type="button">CLOSE THE QUARTER</button>
        </section>
      </div>`;
    $$(root, '.lev').forEach((b) => b.addEventListener('click', () => { share = Number(b.dataset.share); ctx.audio.tap(); render(); }));
    $(root, '.do-close').addEventListener('click', () => {
      const rep = store.closeQuarter(share);
      ctx.audio.stamp();
      if (rep && rep.launchedTo) ctx.audio.bell({ strikes: 3 });
      share = null;
      // The report opens the next memo (a band at the top of the office); the exit has its own page.
      if (rep && store.state.phase === 'report') { store.nextQuarter(); ctx.go('hq'); return; }
      render();
    });
  }

  // ---- report ----------------------------------------------------------------------
  function reportView(s, r) {
    if (!r) { exitView(s); return; }
    const c = r.cash;
    root.innerHTML = `
      <div class="qtr">
        <header class="q-head">
          <div class="q-kicker ui">${esc(s.player.firm.toUpperCase())} · QUARTER ${r.q} REPORT</div>
          <h1 class="hl-cond q-title">${M(c.start)} → ${M(c.end)}</h1>
        </header>
        <section class="q-report paper">
          <table class="ledger">
            <tbody>
              <tr><td>Cash at the open</td><td class="num">${M(c.start)}</td></tr>
              ${c.deposits ? `<tr><td>Deposits at signing</td><td class="num neg">−${M(c.deposits)}</td></tr>` : ''}
              ${c.payoff ? `<tr><td>The board</td><td class="num gain">+${M(c.payoff)}</td></tr>` : ''}
              <tr><td>Revenue</td><td class="num gain">+${M(c.revenue)}</td></tr>
              <tr><td>Compute</td><td class="num neg">−${M(c.payments)}</td></tr>
              <tr><td>Team</td><td class="num neg">−${M(c.burn)}</td></tr>
              ${c.bridge ? `<tr><td>Bridge (for ${C.bridge.equityPct}%)</td><td class="num gain">+${M(c.bridge)}</td></tr>` : ''}
              <tr class="total"><td>Cash at the close</td><td class="num">${M(c.end)}</td></tr>
            </tbody>
          </table>
          <ul class="q-lines">${r.lines.filter((l) => !l.startsWith('Cash ') && !l.startsWith('Next quarter')).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        </section>
        ${r.event ? `<section class="q-next crt amber"><div class="ui q-next-k">NEXT QUARTER</div><div class="hl-cond q-next-h">${esc(r.event.head)}</div><p>${esc(r.event.line)}</p></section>` : ''}
        <button class="btn big spot next-q" type="button">TO THE OFFICE · QUARTER ${s.q} →</button>
      </div>`;
    $(root, '.next-q').addEventListener('click', () => { store.nextQuarter(); ctx.audio.slap(); ctx.go('hq'); });
  }

  // ---- exit -----------------------------------------------------------------------
  function exitView(s) {
    const ex = s.exit;
    const firm = s.player.firm.toUpperCase();
    const best = store.archive.best;
    const h = s.history;
    root.innerHTML = `
      <div class="qtr exit">
        <article class="front paper">
          <div class="front-mast hl-cond">THE COMPUTE GAZETTE</div>
          <div class="front-date caps">${ex.soldForParts ? `Quarter ${ex.q}` : `After quarter ${C.quarters}`} · fictional</div>
          <hr class="rule-double">
          <h1 class="hl front-hl">${esc((HEADLINE[ex.tier] || HEADLINE['TUCK-IN'])(firm))}</h1>
          ${ex.soldForParts ? `
            <p class="front-dek">Cash ran out twice. The racks, the contracts and the logo go to the highest bidder. You keep the story.</p>` : `
            <div class="front-nums">
              <div><span class="caps">Valuation</span><b class="hl">${M(ex.valuation)}</b></div>
              <div><span class="caps">You own</span><b class="hl">${ex.founderPct.toFixed(1)}%</b></div>
              <div class="stake"><span class="caps">Your stake</span><b class="hl">${M(ex.stake)}</b></div>
            </div>
            <div class="front-tier stamp spot stamp-in" style="--rot:-4deg">${esc(ex.tier)}</div>
            <p class="front-dek">${esc(ex.lines[0])}</p>`}
          <section class="drivers">
            <h2 class="caps">What moved your stake</h2>
            <ul>${drivers(s).map((d) => `<li class="${d.tone}"><b>${esc(d.head)}</b> ${esc(d.text)}</li>`).join('')}</ul>
          </section>
          <table class="ledger hist">
            <thead><tr><th>Q</th><th>Board</th><th>Revenue</th><th>Model</th><th>Cash</th></tr></thead>
            <tbody>${h.map((r) => `<tr><td>Q${r.q}</td><td>${r.objective ? `${r.objective.type} ${r.objective.met ? '✓' : '✕'}` : '—'}</td><td class="num">${M(r.revenue)}</td><td>v${r.level}</td><td class="num">${M(r.cash.end)}</td></tr>`).join('')}</tbody>
          </table>
          ${s.capTable.holders.length ? `<p class="small cap-line">Cap table: you ${s.capTable.founderPct.toFixed(1)}% · ${s.capTable.holders.map((x) => `${esc(x.name)} ${x.pct.toFixed(1)}%`).join(' · ')} (${capTotal(s.capTable).toFixed(0)}%)</p>` : ''}
          ${best && !s.dev ? `<p class="small muted">Ventures run on this device: ${int(store.archive.played)}. Best stake: ${M(best.stake)} (${esc(best.firm)}).</p>` : ''}
        </article>
        <div class="exit-actions">
          <button class="btn big spot again" type="button">SAME MARKET, AGAIN</button>
          <button class="btn big ink new-v" type="button">A NEW MARKET</button>
          <button class="btn big ghost daily" type="button">TODAY’S FLOOR</button>
        </div>
        <p class="exit-note small">Same market: the same cards, regime and floors, so you can see what a different call would have done.</p>
      </div>`;
    $(root, '.again').addEventListener('click', () => { ctx.startVenture({ seed: s.seed, dev: s.dev }); ctx.audio.slap(); ctx.go('hq'); });
    $(root, '.new-v').addEventListener('click', () => { ctx.startVenture({ dev: s.dev }); ctx.audio.slap(); ctx.go('hq'); });
    $(root, '.daily').addEventListener('click', () => ctx.go('ad'));
  }

  // Another tab wrote the company: show where it is now (with the notice).
  const onStore = (e) => { if (e.key === 'hsc-venture-v1') render(); };
  window.addEventListener('storage', onStore);
  render();
  return () => window.removeEventListener('storage', onStore);
}

// Start the lever where it serves nearly all of demand and trains with the rest.
function suggest(s) {
  for (const x of [...C.levers].reverse()) {
    const pv = preview(s, x);
    if (pv.served >= 0.98 * pv.demand) return x;
  }
  return 0;
}

// The few things that moved the founder's stake most, in plain words: what
// the player could do differently next time.
function drivers(s) {
  const ex = s.exit;
  const out = [];
  if (ex.soldForParts) {
    out.push({ tone: 'neg', head: 'Cash ran out twice.', text: 'Watch "cash at the close" on the lever screen, and don\'t sign more than the quarter can pay for.' });
  } else if (ex.ARR <= 0) {
    out.push({ tone: 'neg', head: 'No revenue at the exit.', text: 'A buyer pays for customers you serve: keep compute under contract for the last quarter.' });
  } else {
    out.push({ tone: '', head: `${M(ex.ARR)} of yearly revenue × ${ex.multiple.toFixed(2)}.`, text: `Growth ${Math.round(ex.g * 100)}% over the last two quarters, model v${s.model.level}, gross margin ${Math.round(ex.gm * 100)}%.` });
  }
  const safe = s.capTable.holders.filter((h) => h.kind === 'safe');
  if (s.bridges) out.push({ tone: 'neg', head: 'The bridge took 40%.', text: 'Running out of cash once cost two fifths of your company.' });
  if (safe.length) out.push({ tone: '', head: `SAFE investors own ${safe.reduce((t, h) => t + h.pct, 0).toFixed(0)}%.`, text: `${safe.length} investor${safe.length > 1 ? 's' : ''} paid in GPUs: no cash, but every point comes off your stake.` });
  if (s.missed) out.push({ tone: 'neg', head: `${s.missed} missed objective${s.missed > 1 ? 's' : ''}.`, text: `Each took ${Math.round(C.missPenalty * 100)}% off the multiple, and the board money with it.` });
  if (!ex.soldForParts && ex.ARR > 0) {
    if (ex.gm < C.exit.gmRef) out.push({ tone: 'neg', head: 'Thin margins.', text: `Under ${Math.round(C.exit.gmRef * 100)}% gross margin the buyer pays less per dollar of revenue: buy compute further under the board.` });
    else out.push({ tone: 'gain', head: 'Healthy margins.', text: `${Math.round(ex.gm * 100)}% gross margin lifted the multiple: that is the price you paid on the floor.` });
    if (ex.mtm && ex.mtm.net < -5e5) out.push({ tone: 'neg', head: `Contracts past the exit cost ${M(-ex.mtm.net)}.`, text: 'Hours still owed after Q6 were marked to market: long terms late are a bet on prices.' });
    if (s.model.level < 3) out.push({ tone: '', head: `Model v${s.model.level}.`, text: 'Each launch raises your price and your demand: the TRAIN lever and TRAIN objectives get you there.' });
  }
  return out.slice(0, 5);
}