import { fortune, score, V7, opportunityTier } from '../tycoon/arcade.js';
import { mandateQuote } from '../tycoon/mandate.js';
import { gpuBadge } from './arcade-gpu.js';
import { esc } from '../util.js';

export function wealthLedger(g, money) {
  const w = fortune(g);
  return `<details class="wealth-ledger"><summary>How your fortune is valued</summary><dl class="detail-ledger"><dt>Available cash</dt><dd>${money(w.cash)}</dd><dt>Estimated live equity</dt><dd>${money(w.equity)}</dd><dt>Unexpired prepaid inventory at cost</dt><dd>${money(w.inventory)}</dd><dt>Outstanding liabilities</dt><dd>−${money(w.liabilities)}</dd><dt>Estimated net worth</dt><dd><b>${money(w.netWorth)}</b></dd></dl><p>Live shares count at 25% of paper value, or 10% with less than one quarter of runway. Failed or acquired shares count at zero. This is an estimate, not spendable cash or a guaranteed exit price. Inventory expires at the bell. Historical profit is already reflected in cash and is never added again. All purchases are prepaid; no debt is available.</p>${w.holdings.map(s => `<p>${esc(s.name)}: ${money(s.paper)} paper × ${s.factor * 100}% = ${money(s.value)} estimated.</p>`).join('')}</details>`;
}

export function mandateCard(g, money) {
  const m = g.arcade.mandate;
  if (g.arcade.mandateCompleted) return '<section class="panel mandate"><h2>Mandate fulfilled</h2><p>Pacific Research Cooperative paid for capacity from two suppliers. Your first combined contract is on the tape.</p></section>';
  if (!m) return `<section class="panel mandate"><h2>The larger contract</h2><p>Build a track record to receive a combined supplier mandate next round: $90,000 cash, 35 Clout, supplier Trust 2, or 72 compute units delivered. Real success can unlock it early.</p></section>`;
  const q = mandateQuote(g);
  if (!q) return '';
  return `<section class="panel mandate" id="mandate"><p class="eyebrow">COMBINED SUPPLIER MANDATE</p><h2>${esc(m.name)}</h2><p>${gpuBadge(m.gpu)} · eight GPUs from at least two suppliers</p><p><b>${q.secured} / ${q.qty} secured</b> · ${q.suppliers} suppliers in matching stock</p><p>Secured purchase costs <b>${money(q.cost)}</b><br>Buyer payout on full delivery <b>${money(q.revenue)}</b><br>${q.ready ? `Net margin <b>${money(q.margin)}</b>` : q.estimatedMargin !== null ? `Estimated net margin <b>${money(q.estimatedMargin)}</b> after ${money(q.estimatedCost)} total purchase costs` : 'Remaining finite supply cannot currently complete this mandate.'}</p><p class="small">Estimate uses actual unsold releases at current quotes, pays for whole lots, and assumes no recovery on surplus. Supply is not reserved. Deadline: this round’s bell. Purchased stock remains usable elsewhere until then; no payment for partial fulfillment. No extra deposit or penalty.</p><button data-action="mandate-review" ${q.ready ? '' : 'disabled'}>Review combined contract</button></section>`;
}

export function finalReport(g, money) {
  const a = g.arcade, w = fortune(g), sc = score(g);
  const delivered = a.history.reduce((n, h) => n + h.delivered, 0);
  const best = Math.max(0, ...a.history.map(h => Math.round(h.profit * 100)));
  const exits = a.equityLifecycle.filter(h => h.exitProceeds > 0).length;
  return `<section class="report panel final-report"><p class="eyebrow">${a.ending === 'completed' ? 'ROUND 18 / 18 · FINAL BELL' : `ROUND ${g.q} / 18 · OUT OF TRADING CAPITAL`}</p><h1>${a.ending === 'completed' ? 'Your fortune, on the record.' : 'The desk closes. The next one is yours.'}</h1><p>Final estimated net worth</p><strong class="final-fortune">${money(w.netWorth)}</strong><p>Started with $65,000 · ${money(w.netWorth - V7.cash)} change in estimated wealth</p><div class="stats"><div class="stat">Available cash<b>${money(w.cash)}</b></div><div class="stat">Realized profit<b>${money(Math.round(g.profit * 100))}</b></div><div class="stat">Estimated equity<b>${money(w.equity)}</b></div><div class="stat">Rounds completed<b>${a.history.length} / 18</b></div></div>${wealthLedger(g, money)}<h2>Your ledger of achievements</h2><ul><li>${delivered} GPUs delivered to startups.</li><li>Best round: ${money(best)} realized profit.</li><li>${exits} quarters with paid startup exits; ${a.secondarySales.length} secondary share sales.</li><li>${a.mandateCompleted ? 'Combined supplier mandate fulfilled.' : 'Combined supplier mandate remains a challenge for next time.'}</li><li>Opportunity tier ${opportunityTier(g)} reached through money, relationships or deliveries.</li></ul><p>Secondary Tycoon Score: ${sc.total.toLocaleString('en-US')} = ${sc.wealth.toLocaleString('en-US')} wealth + ${sc.bonus} capped reputation and compute bonus (at most 2% of wealth).</p><p>${a.ending === 'completed' ? 'Eighteen economic quarters settled. This run is closed; remaining equity is estimated, not cashed out.' : 'Cash cannot fund even the smallest recovery lot, and no live equity remains. No new debt was created.'}</p><div class="actions"><button data-action="restart-review" class="primary">New Game</button><button data-action="intro-replay">Replay Intro</button></div></section>`;
}
