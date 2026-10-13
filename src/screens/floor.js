// THE FLOOR: the banking hall. Orchestrates the market loop, the board, the
// desks, lot sheets, the rostrum, the signing room and the closing bell.

import { BRAND } from '../config.js';
import { createBoard } from '../ui/board.js';
import { createCrawl } from '../ui/crawl.js';
import { createStations } from '../ui/stations.js';
import { openLotSheet } from '../ui/lotsheet.js';
import { createRostrum } from '../ui/rostrum.js';
import { openSigning } from '../ui/signing.js';
import { openBankOrPush } from '../ui/bankpush.js';
import { createPulse } from '../ui/pulse.js';
import { openSellSheet } from '../ui/sellsheet.js';
import { createTycoonBar } from '../ui/tycoonbar.js';
import { createBulletins, showIntel } from '../ui/bulletin.js';
import { figureSVG } from '../ui/character.js';
import { $, $$, esc, int, usd, usdM, wait } from '../util.js';
import { rivalName } from '../share/text.js';
import { C } from '../venture/constants.js';
import { capacity, startQOf, termQOf } from '../venture/state.js';

export default function floor(root, ctx) {
  const run = ctx.run;
  const m = run.market;
  const md = run.mandate;
  const mode = ctx.mode;
  const mc = { look: { skin: '#C98E62', hair: '#1C1A17', hairStyle: 'slick', suit: 'var(--house)', shirt: '#F4F1EA', tie: '#1B1814', glasses: false, phone: false } };

  // Venture Mode: the floor is this quarter's, saved as it goes (ctx.venture).
  // Filling the objective is NEED MET, not the end; the floor keeps trading.
  const venture = run.kind === 'venture';
  if (venture) {
    const st = ctx.venture.enterFloor(run);
    if (!st || st.phase !== 'floor' || st.floor.seed !== run.seed) { setTimeout(() => ctx.go(ctx.ventureScreen())); return null; }
  }

  // Today's floor counts once: it is locked as soon as the doors open.
  // (Another tab got there first? Then this run is practice, and we say so.)
  const lockedOut = run.kind === 'daily' && !ctx.stats.startDaily(run.daily);
  if (lockedOut) run.kind = 'practice';
  const V = venture ? run.venture : null;
  // Filling the need is a milestone, not the bell, in Venture Mode and the Deal Lab's trading economy.
  const keeps = venture || !!mode.keepsTrading;

  root.innerHTML = `
    <div class="floor-screen${run.tycoon?.marketVersion === 62 ? ' tycoon' : ''}">
      <div class="crawl crt amber" aria-hidden="true"></div>
      <div class="wall">
        <aside class="need-card paper">
          <div class="nc-h ui">${venture ? `${esc(md.objective)} · Q${V.q} OF 6` : esc(mode.needTitle || 'NEED SHEET')} · ${esc(md.company.toUpperCase())}</div>
          <div class="nc-big hl">${mode.needBig ? mode.needBig(run) : `${int(md.qty)} × ${md.gpu}`}</div>
          <ul class="nc-list">
            <li>${md.accept.filter((g) => g !== md.gpu).join(', ') || 'No other GPU'} accepted</li>
            <li>Delivery ≤ ${md.deliveryDays} days</li>
            <li>Term ≥ ${md.minTerm} months</li>
            ${mode.priceLine ? mode.priceLine(run) : `<li>Target <b>${usd(md.target)}</b> · walk <b>${usd(md.walk)}</b></li>`}
            ${venture ? `<li>Cash for deposits <b>${usdM(md.budget)}</b></li><li>Capital line <b>${usdM(md.capitalLine)}</b></li>` : `<li>Budget <b>${usdM(md.budget)}</b></li>`}
            ${mode.needCardExtra ? mode.needCardExtra(run) : ''}
          </ul>
        </aside>
        <div class="board-wrap"></div>
        <aside class="pos-card paper">
          <div class="nc-h ui">YOUR POSITION · PADDLE ${run.paddle}</div>
          <div class="pos-qty hl"><b class="pos-sec">0</b> / ${int(md.qty)}</div>
          <div class="pos-bar"><i></i></div>
          <div class="pos-budget ui">${venture ? 'CASH FOR DEPOSITS' : 'BUDGET LEFT'} <b>${usdM(md.budget)}</b></div>
          ${venture ? `<div class="pos-line ui">CAPITAL LINE <b>${usdM(md.capitalLine)}</b></div><div class="pos-next ui" title="Serving capacity contracted for next quarter vs forecast demand">NEXT Q SERVES <b></b></div><button class="btn investors" type="button">INVESTOR DESK</button>` : ''}
          ${run.challenge && run.challenge.sameRules ? `<div class="pos-beat ui">TO BEAT · <bdi>${esc(rivalName(run.challenge).toUpperCase())}</bdi> <span class="nowrap">· <b>${int(run.challenge.score)}</b></span></div>` : ''}
          ${mode.posExtra ? '<div class="pos-extra ui"></div>' : ''}
          <ol class="pos-fills"></ol>
        </aside>
      </div>
      ${mode.tycoon ? '<section class="tybar paper" aria-label="Tycoon Score"></section>' : ''}
      ${mode.marketPulse ? '<section class="pulse paper" aria-label="Market pulse"></section>' : ''}
      <div class="hall">
        <div class="hall-floor" aria-hidden="true"></div>
        <div class="pit" aria-hidden="true">
          <div class="pit-ring r1"></div><div class="pit-ring r2"></div><div class="pit-ring r3"></div>
          <div class="pit-seal hl-cond">HSC</div>
        </div>
        <div class="rostrum-stand side-house" aria-hidden="true">
          <span class="mc">${figureSVG(mc)}</span>
          <span class="podium"><span class="podium-plate hl-cond">${esc(BRAND.wordmark)}</span></span>
        </div>
        <div class="stations"></div>
        <div class="avatar side-buy" style="--x:50%;--y:99%" aria-hidden="true"></div>
        <div class="bulletin" hidden role="status"></div>
        <div class="floor-tip paper ui">Click any desk to open its lot sheet.<br>Lanyard colors tell you who’s who (key below).</div>
      </div>
      <footer class="floor-foot">
        <ul class="legend ui">
          <li class="side-buy"><i class="lanyard-dot"></i> Buyers</li>
          <li class="side-sell"><i class="lanyard-dot"></i> Sellers</li>
          <li class="side-money"><i class="lanyard-dot"></i> The money</li>
          <li class="side-raise"><i class="lanyard-dot"></i> Raising</li>
          <li class="side-house"><i class="lanyard-dot"></i> The house</li>
        </ul>
        <span class="fictional-note">${esc(BRAND.fictionNote)}</span>
        <button class="btn ghost leave" type="button">${venture ? 'LEAVE: OBJECTIVE MISSED' : esc(mode.finishLabel || 'LEAVE THE FLOOR')}</button>
      </footer>
      <div class="rostrum-dock" hidden></div>
      <div class="overlay-root"></div>
    </div>`;

  const overlay = $(root, '.overlay-root');
  const board = createBoard($(root, '.board-wrap'), { market: m, mandate: md, audio: ctx.audio });
  const crawl = createCrawl($(root, '.crawl'), { market: m });
  const bulletins = createBulletins($(root, '.bulletin'), { audio: ctx.audio });
  if (lockedOut) bulletins.push({ headline: 'PRACTICE FLOOR', sub: 'Today’s floor was already opened on this device, so this run is practice.' });
  let sheet = null;
  let intel = null;
  let paused = false;
  let ended = false;
  let tipShown = true;

  const stations = createStations($(root, '.hall'), { ctx, run, onSelect });
  const rostrum = createRostrum($(root, '.rostrum-dock'), { ctx, run, onWin: startSigning });
  // The Deal Lab's Market Pulse: the floor's public facts at a glance; a row opens its desk.
  const pulse = mode.marketPulse ? createPulse($(root, '.pulse'), { market: m, mandate: md, run, mode, onPick: (c, lot) => onSelect(c, lot), onBuyer: (b) => openSell(b) }) : null;

  // THE TYCOON (V6): the running score, moved by deals, sales and back-outs.
  const tbar = mode.tycoon ? createTycoonBar($(root, '.tybar'), { mode, run }) : null;

  // The Deal Lab's aftermarket: a buyer on the floor, and your spares (economy.js).
  let sell = null;
  const persistBuyerChange = run.onBuyerChanged;
  if (persistBuyerChange) run.onBuyerChanged = () => {
    persistBuyerChange(); sheet?.refresh(); sell?.update(); pulse?.refresh();
  };
  function openSell(b) {
    if (ended || paused || !mode.aftermarket) return;
    if (b.state === 'due') return;
    mode.onBuyerTalk?.(run, b);
    hideTip();
    intel?.close();
    if (sheet) { sheet.close(); sheet = null; }
    sell?.close();
    sell = openSellSheet(overlay, { ctx, run, buyer: b, onClose: () => { sell = null; },
      onSource: (lot) => { run.resaleBuyerId = b.id; onSelect(m.character(lot.sellerId), lot, true); },
      onSold: (sale) => { mode.onSale?.(run, sale); paintPosition(); pulse?.refresh(); tbar?.update(`${sale.equity ? 'Equity from' : 'Sold to'} ${sale.buyer}`); } });
  }

  function hideTip() {
    if (!tipShown) return;
    tipShown = false;
    $(root, '.floor-tip').classList.add('gone');
  }

  function onSelect(c, lot, resale = false) {
    if (ended || paused) return;
    if (run.tycoon?.marketVersion === 62) run.resaleLotId = resale && lot ? lot.id : null;
    hideTip();
    intel?.close();
    sell?.close();
    if (lot) {
      if (lot.status === 'cooling') { stations.shout(c.id, 'GIVE ME A MINUTE.'); ctx.audio.buzz(); return; }
      if (lot.status !== 'open') return;
      // The Deal Lab's push: only the push desk trades with you until it's done.
      const blocked = mode.blockedLot ? mode.blockedLot(run, lot) : null;
      if (blocked) { stations.shout(c.id, blocked); ctx.audio.buzz(); return; }
      if (sheet) sheet.close();
      sheet = openLotSheet(overlay, {
        ctx, run, lot,
        onClose: () => { sheet = null; stations.setEngaged(null); tbar?.update('Backed out'); },
        onSign: startSigning,
      });
      stations.setEngaged(lot.id);
    } else {
      intel = showIntel(overlay, mode.intel(c, run), { onClose: () => { intel = null; } });
    }
  }

  function startSigning(deal) {
    if (ended) return;
    if (sheet) { sheet.close(); sheet = null; }
    intel?.close();
    closeInvestors();
    paused = true;
    const lot = m.lot(deal.lotId);
    mode.recordDeal(run, deal);
    tbar?.update(`${int(deal.qty)} ${deal.gpu} from ${deal.firm}`);
    if (venture) {
      ctx.venture.sign(deal); // saved at signing: a reload keeps it, once
      const st = ctx.venture.state;
      if (!st || st.phase !== 'floor' || !st.floor.deals.some((d) => d.id === deal.id)) { lostSync(); return; }
    }
    if (lot) m.take(lot, deal.qty);
    m.recordFill({ gpu: deal.gpu, qty: deal.qty, site: deal.site, term: deal.term, rate: deal.rate, by: 'you' });
    paintPosition();
    const filled = mode.isFilled(run);
    const ends = mode.endsOnFill !== false && filled;
    // The Deal Lab asks BANK or PUSH once the sheet fills (mode.pushOffer); the push deal ends the floor.
    const offer = ends && mode.pushOffer ? mode.pushOffer(run) : null;
    openSigning(overlay, {
      ctx, run, deal, filled: ends && !offer, need: mode.need(run), quick: (venture && (V.q > 1 || run.deals.length > 1)) || !!mode.quickSigning,
      next: mode.signingNext ? mode.signingNext(run, deal, offer) : null,
      onDone: () => {
        if (offer) { bankOrPush(offer); return; }
        paused = false;
        if (ends) { end('filled'); return; }
        if (keeps && filled) needMet();
        if (lot) stations.react(lot);
      },
    });
  }

  // BANK or PUSH (Deal Lab): bank ends the floor; push brings one more seller and their clock.
  function bankOrPush(offer) {
    openBankOrPush(overlay, {
      ctx, run, offer,
      onBank: () => { mode.bank(run); paused = false; end('filled'); },
      onPush: () => {
        const lot = mode.startPush(run);
        paused = false;
        if (!lot) { end('filled'); return; }
        setTimeout(() => { if (!ended && !sheet && lot.status === 'open') onSelect(m.character(lot.sellerId), lot); }, 700);
      },
    });
  }

  // Another tab moved this company on (or replaced it): this floor can't be
  // saved any more. Say so, stop, and show where the company really is.
  function lostSync() {
    if (ended) return;
    ended = true;
    sheet?.close();
    intel?.close();
    closeInvestors();
    m.closed = true;
    bulletins.push({ headline: 'YOUR COMPANY MOVED ON IN ANOTHER TAB', sub: 'This floor stopped saving. Taking you to where the company is now.', tone: 'up' });
    ctx.audio.buzz();
    setTimeout(() => { ctx.venture.reload(); ctx.go(ctx.ventureScreen()); }, 3000);
  }
  const onStore = (e) => {
    if (!venture || e.key !== 'hsc-venture-v1') return;
    const mine = ctx.venture.state;
    let theirs = null;
    try { theirs = JSON.parse(e.newValue).current; } catch { /* unreadable: the save handles it */ }
    if (!theirs || !mine || theirs.id !== mine.id || theirs.rev > mine.rev) lostSync();
  };
  window.addEventListener('storage', onStore);

  // NEED MET (Venture Mode) / ORDER FILLED (the Deal Lab): a milestone, not the bell.
  let metShown = false;
  const metLabel = () => (venture ? 'BACK TO THE OFFICE →' : `${mode.finishLabel || 'LEAVE THE FLOOR'} →`);
  function needMet() {
    if (metShown || !keeps) return;
    metShown = true;
    bulletins.push(venture
      ? { headline: `NEED MET · ${md.objective}`, sub: 'The floor is still open. Every deal from here is optional: buy only what you can use.', tone: 'down' }
      : mode.filledBulletin(run));
    ctx.audio.bell({ strikes: 2 });
    const card = $(root, '.pos-card');
    if (card && !$(card, '.pos-stamp')) card.insertAdjacentHTML('beforeend', `<div class="pos-stamp stamp spot stamp-in" style="--rot:-9deg">${venture ? 'NEED MET' : esc(mode.filledStamp || 'FILLED')}</div>`);
    leave.textContent = metLabel();
    leave.classList.remove('ghost');
    leave.classList.add('spot');
  }

  // The investor desk (Venture Mode): this quarter's Compute SAFE offers, until the bell.
  let investors = null;
  function closeInvestors() { investors?.remove(); investors = null; }
  function openInvestors() {
    closeInvestors();
    const s = ctx.venture.state;
    const taken = new Set(s.book.filter((e) => e.src === 'safe').map((e) => e.id));
    const offers = (s.memo && s.memo.offers) || [];
    investors = document.createElement('div');
    investors.className = 'investor-desk paper side-money';
    investors.setAttribute('role', 'dialog');
    investors.setAttribute('aria-label', 'Investor desk');
    investors.innerHTML = `
      <div class="nc-h ui"><i class="lanyard-dot"></i> THE MONEY · INVESTOR DESK <button class="ls-x btn inv-x" type="button" aria-label="Close">✕</button></div>
      <p class="small">GPUs now, no cash, for a slice of the company. You own <b>${s.capTable.founderPct.toFixed(1)}%</b>.</p>
      ${offers.length ? offers.map((o) => `
        <div class="sf-offer ${taken.has(o.id) ? 'taken' : ''}">
          <div><b>${esc(o.investor)}</b></div>
          <div>${int(o.qty)} ${o.gpu} for ${o.termQ} quarters, ${o.startQ === o.q ? 'live this quarter' : 'from next quarter'}, for <b>${o.equityPct}%</b></div>
          ${taken.has(o.id) ? '<div class="sf-offer-taken ui">SIGNED</div>' : `<button class="btn take-safe" data-id="${o.id}" type="button">TAKE IT FOR ${o.equityPct}%</button>`}
        </div>`).join('') : '<p class="muted small">No offers this quarter.</p>'}`;
    overlay.appendChild(investors);
    $(investors, '.inv-x').addEventListener('click', closeInvestors);
    $$(investors, '.take-safe').forEach((b) => b.addEventListener('click', () => {
      if (!b.classList.contains('armed')) { b.classList.add('armed', 'spot'); b.textContent = 'SURE? CLICK AGAIN'; return; }
      const before = ctx.venture.state;
      const after = ctx.venture.acceptSafe(b.dataset.id);
      const e = after && after !== before && after.book.find((x) => x.id === b.dataset.id);
      if (e) {
        // The floor counts it from now on, after the deals already signed.
        V.safe.push({ ...e });
        ctx.audio.stamp();
        bulletins.push({ headline: `SAFE SIGNED · ${int(e.qty)} ${e.gpu}`, sub: `${e.firm} takes ${e.equityPct}% of the company.`, tone: 'flat' });
        paintPosition();
        if (mode.isFilled(run)) needMet();
      }
      openInvestors();
    }));
  }

  function paintPosition() {
    const sec = mode.secured(run);
    $(root, '.pos-sec').textContent = int(Math.min(sec, md.qty));
    $(root, '.pos-bar i').style.width = `${Math.min(100, (sec / md.qty) * 100)}%`;
    $(root, '.pos-budget b').textContent = usdM(mode.budgetLeft(run));
    if (venture) {
      $(root, '.pos-line b').textContent = usdM(mode.lineLeft(run));
      // Next quarter: serving capacity under contract (book + today's deals) vs forecast demand.
      const st = ctx.venture.state;
      const q1 = V.q + 1;
      let cap = capacity(st, q1).serve;
      for (const d of run.deals) { const a = startQOf(d.delivery, V.q); if (q1 >= a && q1 < a + termQOf(d.term)) cap += d.qty * C.serve[d.gpu]; }
      const fc = st.demand * (1 + C.growth);
      const el = $(root, '.pos-next b');
      el.textContent = V.q < C.quarters ? `${int(cap)} / ${int(fc)}` : 'THE EXIT';
      el.className = V.q < C.quarters && cap > 1.25 * fc ? 'over' : V.q < C.quarters && cap < 0.9 * fc ? 'under' : '';
    }
    const safes = venture ? V.safe.map((e) => `<li>${int(e.qty)} ${e.gpu} SAFE <b>${e.equityPct}%</b></li>`) : [];
    $(root, '.pos-fills').innerHTML = [...safes, ...run.deals.map((d) => `<li${d.optional ? ' class="opt"' : ''}>${int(d.qty)} ${d.gpu} ${esc(d.site)} ${d.term}M <b>${usd(d.eff)}</b>${d.financed ? ' <i>fin.</i>' : ''}${d.optional ? ' <i>opt.</i>' : ''}</li>`)].join('');
    $(root, '.pos-card').classList.toggle('filled', mode.isFilled(run));
    if (mode.posExtra) $(root, '.pos-extra').innerHTML = mode.posExtra(run);
  }

  async function end(reason) {
    if (ended) return;
    ended = true;
    sheet?.close();
    sell?.close();
    intel?.close();
    closeInvestors();
    m.closed = true;
    if (reason === 'bell') {
      ctx.audio.bell({ strikes: 4, gap: 0.45, ring: 3.2 });
      const closing = document.createElement('div');
      closing.className = 'closing-bell';
      closing.innerHTML = '<div class="cb-time ui">5:00 PM</div><div class="stamp cb-stamp stamp-in" style="--rot:-6deg">MARKET CLOSED</div>';
      overlay.appendChild(closing);
      await wait(2600);
    }
    if (venture) {
      ctx.venture.leaveFloor(reason === 'bell' ? 'bell' : 'office');
      ctx.go('quarter');
      return;
    }
    if (mode.afterFloor) { mode.afterFloor(ctx, run, reason); return; }
    ctx.go('results');
  }

  // Market wiring
  const offs = [
    m.on('bulletin', (b) => {
      bulletins.push(b);
      const mcEl = $(root, '.rostrum-stand');
      mcEl.classList.add('shouting');
      setTimeout(() => mcEl.classList.remove('shouting'), 2600);
    }),
    m.on('lot:gone', ({ lot, rival }) => {
      if (sheet && sheet.lot === lot) sheet.lose();
      if (rival && !lot.goneShown) {
        lot.goneShown = true;
        bulletins.push({ headline: `${int(lot.qty)} ${lot.gpu} ${lot.site.city.toUpperCase()}: GONE`, sub: `Sold to ${rival.firm || 'a rival'} at ${usd(lot.ask)}. Should’ve closed.`, tone: 'up' });
        ctx.audio.buzz();
      }
      // The Deal Lab's push lost to another broker (the mode hears this after us): that was the
      // floor's last deal, so the tape follows the GONE bulletin.
      if (mode.pushDone) setTimeout(() => { if (!ended && !paused && mode.pushDone(run)) end('filled'); }, 2600);
    }),
    m.on('lot:status', (lot) => { if (sheet && sheet.lot === lot) sheet.refresh(); }),
    m.on('close', () => end('bell')),
  ];

  // Leave early (two clicks). In Venture Mode, once the need is met, one
  // click: BACK TO THE OFFICE.
  const leave = $(root, '.leave');
  let leaveArmed = null;
  const leaveLabel = () => (venture ? 'LEAVE: OBJECTIVE MISSED' : mode.finishLabel || 'LEAVE THE FLOOR');
  leave.addEventListener('click', () => {
    if (metShown) { end('office'); return; }
    if (leaveArmed) { clearTimeout(leaveArmed); end('left'); return; }
    leave.textContent = mode.finishConfirm ? mode.finishConfirm(run) : 'SURE? CLICK AGAIN';
    leaveArmed = setTimeout(() => { leave.textContent = metShown ? metLabel() : leaveLabel(); leaveArmed = null; }, 3000);
  });
  if (mode.posExtra) paintPosition();
  if (venture) {
    $(root, '.investors').addEventListener('click', () => { if (!ended && !paused) openInvestors(); });
    paintPosition();
    // This quarter's floor, in one line: what the board wants and what's in force.
    const p = V.pending;
    const theme = p.crunch ? 'CRUNCH: most blocks are half size and rivals move faster.'
      : p.glut ? 'GLUT: compute is cheap and a second wind-down seller is on the floor.'
        : p.power ? 'POWER: most blocks deliver 45 days late. The 24-month desk is in.'
          : p.enterprise ? 'ENTERPRISE: the pilot customer pays 1.5×.'
            : p.demand ? 'DEMAND: customers are shopping. Capacity to spare wins them.'
              : md.accept.includes('B200') ? 'Blackwell B200s are on the floor for training.' : 'A normal afternoon. The bell rings at 5.';
    setTimeout(() => { if (!ended) bulletins.push({ headline: `Q${V.q} · ${md.objective} ${int(md.qty)} ${md.gpu}`, sub: theme, tone: p.crunch || p.power ? 'up' : p.glut ? 'down' : 'flat' }); }, 400);
    // SAFE compute taken in the office may already meet the objective.
    if (mode.isFilled(run)) setTimeout(needMet, 1200);
  }
  // A mode can open its floor with a bulletin (the Deal Lab says what you need and how it scores).
  if (mode.openingBulletin) {
    const b = mode.openingBulletin(run);
    if (b) setTimeout(() => { if (!ended) bulletins.push(b); }, 400);
  }

  // Main loop
  let raf = 0;
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused && !ended) m.update(dt);
    pulse?.tick(dt);
    sell?.update();
    board.updateClock();
    stations.tick();
    sheet?.update();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  ctx.audio.startRoom();
  setTimeout(() => { if (tipShown) hideTip(); }, 14000);

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(leaveArmed);
    ctx.audio.stopRoom();
    offs.forEach((o) => o());
    board.destroy();
    crawl.destroy();
    bulletins.destroy();
    stations.destroy();
    rostrum.destroy();
    pulse?.destroy();
    tbar?.destroy();
    closeInvestors();
    window.removeEventListener('storage', onStore);
  };
}
