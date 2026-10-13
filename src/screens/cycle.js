// THE QUARTER REPORT (V6 Tycoon): the books close on a floor. What moved the Tycoon Score and
// why, the money, the startups (and your stakes), the relationships you've earned, and the
// next quarter. At the end of a run, the final score, the quarter-4 checkpoint and the history.

import { $, esc, int, usd } from '../util.js';
import { GPUS } from '../data/gpus.js';
import { ARCH_LABEL, TY, checkpointScore, commitments, paperValue, matchGpu, pricesFor } from '../tycoon/game.js';
import { wordOf } from '../tycoon/demand.js';
import { GPU_LIST } from '../tycoon/gpu.js';
import { WORK, badge } from '../tycoon/gpu.js';
import { money } from '../modes/economy.js';
import { barHTML } from '../ui/tycoonbar.js';

const signed = (n) => `${n < 0 ? '−' : '+'}${int(Math.abs(n))}`;
const M = (x) => `$${(x / 1e6).toFixed(2)}M`;

export default function cycle(root, ctx) {
  const g = ctx.tycoon.state;
  if (!g || !g.report) { setTimeout(() => ctx.go('home')); return null; }
  const over = g.phase === 'over';
  const rep = g.report;
  const a = rep.after, b = rep.before;
  const bench = Object.fromEntries(Object.entries(GPUS).map(([k, v]) => [k, v.base]));
  const cp4 = checkpointScore(g);
  const paper = paperValue(g);

  const lines = rep.lines.map((l) => `<li class="cy-${l.kind}"><span>${esc(l.text)}</span>${l.pts != null ? `<b class="${l.pts < 0 ? 'neg' : ''}">${signed(l.pts)}</b>` : ''}</li>`).join('');
  const startups = g.startups.map((s) => {
    const r = rep.startups.find((x) => x.id === s.id);
    const live = s.alive && !s.exited;
    const fitG = live ? matchGpu(s.work, bench) : null;
    return `<li class="cy-su ${live ? '' : 'gone'}">
      <div class="cy-su-h"><b>${esc(s.name)}</b> <span class="muted">${esc(s.sector)} · ${esc(ARCH_LABEL[s.arch])}</span> <span class="cy-st ui">${esc(r ? r.status : live ? '' : s.exited ? 'ACQUIRED' : 'SHUT DOWN')}</span></div>
      ${r && r.text ? `<div class="small">${esc(r.text)}</div>` : ''}
      ${s.service ? `<div class="small cy-service"><b>${!live ? 'RELATIONSHIP ENDED' : s.cash < s.burn * 2 ? 'SHORT RUNWAY · AT RISK' : s.trust >= TY.trustedClient ? 'TRUSTED CUSTOMER' : s.service.quarters ? 'SUPPLIED CUSTOMER' : 'NO SIGNED SERVICE'}</b> · ${int(s.service.gpuMonths)} GPU-months delivered over ${s.service.quarters} quarters.<br>${esc(s.service.last)}</div>` : ''}
      ${live ? `<div class="small">Needs: ${esc(WORK[s.work].label)}, ${s.months}-month terms · best fit ${badge(fitG)} at about ${usd(pricesFor(s, bench)[fitG])}${s.trust >= TY.trustedClient ? ' · <b>trusts you: comes to you first</b>' : ''}</div>` : ''}
      ${s.stake > 0 ? `<div class="small">Your stake <b>${(s.stake * 100).toFixed(2)}%</b> · paper value ${money(s.stake * s.val).slice(1)} (not in your score until they exit)</div>` : ''}
    </li>`;
  }).join('');
  const hist = g.hist.map((h) => `<tr><td>Q${h.q}</td><td>${int(h.total)}</td><td>${int(h.profit)}</td><td>${int(h.clout)}</td><td>${int(h.cp)}</td><td>${M(h.cash)}</td></tr>`).join('');

  root.innerHTML = `
    <div class="cycle-screen">
      <header class="cy-head">
        <div class="cy-kicker ui">THE TYCOON · ${esc(g.player.firm || 'Your desk')} · ${over ? 'THE RUN IS OVER' : `QUARTER ${rep.q} SETTLED`}</div>
        <h1 class="hl-cond cy-hl">${over ? (g.insolvent ? 'Insolvent.' : 'The run ends.') : `Quarter ${rep.q} closed.`}</h1>
        <div class="cy-score"><span class="ui">TYCOON SCORE</span> <b class="hl">${int(a.total)}</b> <span class="cy-delta ui ${a.total >= b.total ? 'up' : 'down'}">${signed(a.total - b.total)} this quarter</span></div>
        <div class="ty-parts ui"><span class="ty-part profit">PROFIT <b>${int(a.profit)}</b> <i>${signed(a.profit - b.profit)}</i></span><span class="ty-part clout">CLOUT <b>${int(a.clout)}</b> <i>${signed(a.clout - b.clout)}</i></span><span class="ty-part cp">COMPUTE POWERED <b>${int(a.cp)}</b> <i>${signed(a.cp - b.cp)}</i></span></div>
        ${barHTML(a)}
        ${over ? `<p class="cy-final">${cp4 != null ? `Score after quarter ${TY.checkpoint} (the one to compare): <b>${int(cp4)}</b> · ` : `Ended before quarter ${TY.checkpoint}: no checkpoint score · `}Lifetime: <b>${int(a.total)}</b> over ${g.hist.length} quarter${g.hist.length === 1 ? '' : 's'}.</p>` : ''}
      </header>
      <div class="cy-actions">
        ${over ? '<button class="btn big spot cy-new" type="button">NEW RUN</button><button class="btn big cy-home" type="button">THE MAIN PAGE</button>'
          : `<button class="btn big spot cy-next" type="button">QUARTER ${g.q} →</button><button class="btn big ghost cy-end" type="button">END THE RUN</button>`}
      </div>
      <section class="paper cy-sec"><div class="lb-h caps">What moved your score</div><ul class="cy-lines">${lines}</ul></section>
      <section class="paper cy-sec"><div class="lb-h caps">The money</div>
        <ul class="econ-ledger">
          <li><span>Cash (yours to commit next quarter without the capital desk)</span><b>${M(rep.cashBefore)} → ${M(rep.cashAfter)}</b></li>
          <li><span>Booked this quarter (contracted; turns into cash over each contract's term)</span><b>${money(rep.booked)}</b></li>
          <li><span>Compute still owed to clients (cost of the remaining service)</span><b>${M(commitments(g))}</b></li>
          <li><span>Equity on paper (counts only when a startup exits)</span><b>${M(paper)}</b></li>
        </ul>
      </section>
      <section class="paper cy-sec"><div class="lb-h caps">The startups</div><ul class="cy-sus">${startups}</ul></section>
      ${!over ? holdingsHTML(g) : ''}
      ${rep.perks.length ? `<section class="paper cy-sec"><div class="lb-h caps">Relationships</div><ul class="cy-lines">${rep.perks.map((p) => `<li><span>${esc(p)}</span></li>`).join('')}</ul></section>` : ''}
      ${over || g.hist.length > 1 ? `<section class="paper cy-sec"><div class="lb-h caps">Quarter by quarter</div><table class="cy-hist"><tr><th></th><th>Score</th><th>Profit</th><th>Clout</th><th>Compute</th><th>Cash</th></tr>${hist}</table></section>` : ''}
      <p class="fictional-note">All firms, people, startups, prices and events are fictional. Seed ${g.seed}. Saved on this device only.</p>
    </div>`;

  root.querySelectorAll('.cy-sublet').forEach((b) => b.addEventListener('click', () => {
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'SURE? SUBLET IT'; return; }
    ctx.tycoon.dispose(b.dataset.id);
    ctx.go('cycle');
  }));
  $(root, '.cy-next')?.addEventListener('click', () => { ctx.audio.slap?.(); if (ctx.newQuarter()) ctx.go('floor'); });
  const end = $(root, '.cy-end');
  end?.addEventListener('click', () => {
    if (!end.classList.contains('armed')) { end.classList.add('armed'); end.textContent = 'SURE? END AND SCORE'; return; }
    ctx.tycoon.end();
    ctx.go('cycle');
  });
  $(root, '.cy-new')?.addEventListener('click', () => { ctx.newTycoon(); ctx.go('floor'); });
  $(root, '.cy-home')?.addEventListener('click', () => ctx.go('home'));
  ctx.audio.stamp?.();
  return null;
}

// YOUR COMPUTE (V6.1): capacity you hold into next quarter, what holding it costs, and the
// way out (sublet the rest of its term: it's booked at that already, so no score change).
// Plus the word on the street about next quarter's demand (right about 70% of the time).
function holdingsHTML(g) {
  const hs = (g.holdings || []).filter((h) => h.qty > 0 && h.months > 0);
  const word = wordOf(g.seed, g.q);
  const heat = GPU_LIST.map((x) => `${badge(x)} ${word[x].toUpperCase()}`).join(' · ');
  const rows = hs.map((h) => `<li class="cy-hold"><span>${badge(h.gpu)} <b>${int(h.qty)}</b> · ${h.months} months left · cost ${usd(h.eff)}/hr · holding it costs ${money(-h.qty * TY.carry * 3 * 730)} a quarter</span><button class="btn cy-sublet" type="button" data-id="${esc(h.id)}">SUBLET THE REST</button></li>`).join('');
  return `<section class="paper cy-sec"><div class="lb-h caps">Your compute</div>
    ${hs.length ? `<p class="small">Unsold capacity you still hold. Sell it on a coming floor, trade it to a startup for equity, or sublet the rest of its term (no further cost).</p><ul class="cy-lines">${rows}</ul>` : '<p class="small">You hold no spare capacity. Spares you don’t sell on a floor are held here.</p>'}
    <p class="small cy-word">Word on the street for next quarter's demand: ${heat} <span class="muted">(right about 70% of the time)</span></p>
  </section>`;
}
