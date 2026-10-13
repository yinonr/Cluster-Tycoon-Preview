// HOUSE LETTER, NEED SHEET, DAY SHEET. SOURCE: Notion Act I ("A buyer writes
// out a need sheet: how much, when, for how long, and how they'll pay" ... "The
// house stamps your file" ... "the day sheet arrives: doors, your color, and
// your appointments. The house has matched you.")

import { BRAND, FLOOR_SECONDS } from '../config.js';
import { $, esc, dotted, usd, usdM, int, mmss } from '../util.js';
import { C } from '../venture/constants.js';
import { optionOf } from '../venture/objectives.js';

export default function sheet(root, ctx) {
  if (ctx.run && ctx.run.kind === 'venture') { ventureSheet(root, ctx); return; }
  function render() {
    const run = ctx.run;
    const md = run.mandate;
    const { seller, capital, founder } = run.matched;
    root.innerHTML = `
      <div class="desk-bg">
        <div class="letter paper">
          <header class="letterhead">
            ${BRAND.logoSrc ? `<img src="${esc(BRAND.logoSrc)}" alt="${esc(BRAND.name)}">` : `<div class="wordmark hl-cond">${esc(BRAND.wordmark)}</div>`}
            <div class="lh-sub caps">${dotted(['The House', BRAND.venue, BRAND.city])}</div>
          </header>
          <hr class="rule-double">
          <p class="letter-dear">Dear ${esc(run.playerName || 'applicant')},</p>
          <p class="letter-re"><b>Re:</b> Your application · ${esc(md.company)} (${esc(md.stage)}, ${esc(md.sector)})</p>
          <p>You’ve been approved. Your need sheet is below as filed, and your day sheet is attached. Bring your pass.</p>
          <div class="pass-stamp stamp spot stamp-in" style="--rot:-9deg">PASS</div>

          <section class="need carbon">
            <div class="form-h">
              <span class="caps">Need sheet · Form HSC-B${run.kind === 'daily' ? `<b class="floor-tag"><i class="sep"> · </i>Today’s floor ${esc(run.daily.label)} · <span class="nowrap">counts once</span></b>` : run.kind === 'practice' ? '<b class="floor-tag plain"><i class="sep"> · </i>Practice floor</b>' : run.kind === 'lab' ? '<b class="floor-tag plain"><i class="sep"> · </i>Deal Lab · not recorded</b>' : ''}</span>
              <span class="side-tag side-buy"><i class="lanyard-dot"></i> BUYING</span>
            </div>
            <dl class="form-grid">
              <dt>How much</dt><dd><b class="big">${int(md.qty)} × ${md.gpu}</b> <span class="muted">(${md.accept.slice(1).join(', ')} accepted)</span></dd>
              <dt>When</dt><dd>Delivered within <b>${md.deliveryDays} days</b></dd>
              <dt>How long</dt><dd><b>${md.minTerm} months</b> minimum</dd>
              <dt>Price</dt><dd>Target <b>${usd(md.target)}</b>/GPU-hr · walk-away <b>${usd(md.walk)}</b></dd>
              <dt>How you’ll pay</dt><dd><b>${usdM(md.budget)}</b> budget · ${esc(md.payment)}</dd>
              <dt>The bell</dt><dd>Market opens at noon, closes at <b>5:00 PM</b> <span class="muted">(${mmss(FLOOR_SECONDS)} on the floor)</span></dd>
              ${run.kind === 'lab' ? '<dt>The lab</dt><dd>Every deal is graded when you sign it. No points for speed: the market and the rivals are the clock. Agreed prices hold for 10 seconds. The tape shows your par: the best a perfect negotiator could do at noon.</dd>' : ''}
            </dl>
          </section>

          <section class="daysheet">
            <div class="form-h"><span class="caps">Day sheet · the house has matched you</span></div>
            <ul>
              <li><i class="lanyard-dot side-sell"></i> A seller with capacity in your window: <b>${esc(seller.firm)}</b>, ${esc(seller.site.city)} desk</li>
              <li><i class="lanyard-dot side-money"></i> A lender: <b>${esc(capital.firm)}</b>, the capital desk</li>
              <li><i class="lanyard-dot side-raise"></i> A founder with the same problem you have: <b>${esc(founder.firm)}</b></li>
            </ul>
            <p class="muted small">Every lot on the floor was confirmed by the house before it got there. Prices move. Rivals circle. The bell doesn’t wait.</p>
          </section>

          <div class="letter-actions">
            <button class="btn big ink go" type="button">PICK UP YOUR BADGE</button>
            ${run.kind === 'daily' || run.challenge ? '' : '<button class="linkish reroll" type="button">File a different need sheet ↻</button>'}
          </div>
        </div>
      </div>`;
    ctx.audio.stamp();
    $(root, '.go').addEventListener('click', () => ctx.go('lobby'));
    $(root, '.reroll')?.addEventListener('click', () => { if (run.kind === 'lab') ctx.newLab(); else ctx.newRun(); render(); });
  }
  render();
}

// Venture Mode: the board's objective as the need sheet. No reroll (the
// objective is committed); from Q2 the badge is already on, so straight to the floor.
function ventureSheet(root, ctx) {
  const run = ctx.run;
  const md = run.mandate;
  const st = ctx.venture.state;
  if (!st || st.phase !== 'briefed') { setTimeout(() => ctx.go(ctx.ventureScreen())); return; }
  const obj = optionOf(st.memo, st.memo.chosen);
  const { seller, capital, founder } = run.matched;
  const M = (n) => `$${(n / 1e6).toFixed(1)}M`;
  const pays = obj.type === 'PILOT'
    ? `${M(obj.bonus)} up front, and ${int(C.objectives.pilot.demandPerGpu * obj.qty)} GPU-eq of new demand`
    : `a tranche of ${M(C.tranche * (C.trancheQ.base + C.trancheQ.k * 0.4))} at target, up to ${M(C.tranche * (C.trancheQ.base + C.trancheQ.k))} if you buy well under it`;
  root.innerHTML = `
    <div class="desk-bg">
      <div class="letter paper">
        <header class="letterhead">
          <div class="wordmark hl-cond">${esc(md.company)}</div>
          <div class="lh-sub caps">${dotted(['From the board', `Quarter ${md.q} of ${C.quarters}`])}</div>
        </header>
        <hr class="rule-double">
        <p class="letter-dear">Dear ${esc(run.playerName || 'founder')},</p>
        <p class="letter-re"><b>Re:</b> This quarter’s objective · <b>${esc(obj.type)}</b></p>
        <p>${esc(obj.brief)} Meet it on the floor and the board pays ${esc(pays)}. Miss it and the exit multiple takes ${Math.round(C.missPenalty * 100)}% off.</p>
        <div class="pass-stamp stamp spot stamp-in" style="--rot:-9deg">${esc(obj.type)}</div>

        <section class="need carbon">
          <div class="form-h">
            <span class="caps">Need sheet · Form HSC-B<b class="floor-tag"><i class="sep"> · </i>Board objective · <span class="nowrap">Q${md.q} of ${C.quarters}</span></b></span>
            <span class="side-tag side-buy"><i class="lanyard-dot"></i> BUYING</span>
          </div>
          <dl class="form-grid">
            <dt>How much</dt><dd><b class="big">${int(md.qty)} × ${md.gpu}</b> <span class="muted">${md.accept.length > 1 ? `(${md.accept.filter((g) => g !== md.gpu).join(', ')} accepted, priced per ${md.power === 'train' ? 'training' : 'serving'} unit)` : ''}</span></dd>
            <dt>When</dt><dd>Delivered within <b>${md.deliveryDays} days</b></dd>
            <dt>How long</dt><dd><b>${md.minTerm} months</b> minimum</dd>
            <dt>Price</dt><dd>Target <b>${usd(md.target)}</b>/GPU-hr · walk-away <b>${usd(md.walk)}</b></dd>
            <dt>How you’ll pay</dt><dd>Cash for deposits <b>${usdM(md.budget)}</b> · capital line <b>${usdM(md.capitalLine)}</b>. ${esc(md.payment)}</dd>
            <dt>After NEED MET</dt><dd>The floor stays open. Anything else you sign is an optional trade, judged on what it does for the company.</dd>
            <dt>The bell</dt><dd>Market opens at noon, closes at <b>5:00 PM</b> <span class="muted">(${mmss(FLOOR_SECONDS)} on the floor)</span></dd>
          </dl>
        </section>

        <section class="daysheet">
          <div class="form-h"><span class="caps">Day sheet · the house has matched you</span></div>
          <ul>
            <li><i class="lanyard-dot side-sell"></i> A seller with capacity in your window: <b>${esc(seller.firm)}</b>, ${esc(seller.site.city)} desk</li>
            <li><i class="lanyard-dot side-money"></i> A lender: <b>${esc(capital.firm)}</b>, the capital desk</li>
            <li><i class="lanyard-dot side-money"></i> Investors with Compute SAFE offers: the investor desk</li>
            <li><i class="lanyard-dot side-raise"></i> A founder with the same problem you have: <b>${esc(founder.firm)}</b></li>
          </ul>
        </section>

        <div class="letter-actions">
          <button class="btn big ink go" type="button">${md.q === 1 ? 'PICK UP YOUR BADGE' : 'TO THE FLOOR →'}</button>
          <button class="linkish office" type="button">← Back to the office</button>
        </div>
      </div>
    </div>`;
  ctx.audio.stamp();
  $(root, '.go').addEventListener('click', () => ctx.go(md.q === 1 ? 'lobby' : 'floor'));
  $(root, '.office').addEventListener('click', () => ctx.go('hq'));
}
