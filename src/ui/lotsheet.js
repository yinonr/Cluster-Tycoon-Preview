// THE LOT SHEET: the negotiation. A paper lot sheet on the left, the tape on a
// green CRT on the right, and a short row of structured moves: term, quantity,
// your number, counter / take / walk, and the capital desk when you're over
// budget.

import { figureSVG } from './character.js';
import { contractValue } from '../data/gpus.js';
import { el, $, esc, int, usd, round2, mmss, shake } from '../util.js';

export function openLotSheet(host, { ctx, run, lot, onClose, onSign }) {
  const m = run.market;
  const mode = ctx.mode;
  const md = run.mandate;
  const seller = m.character(lot.sellerId);
  const capital = run.capitalDesk;
  // Its own streams, seed + lot (see mode.haggle).
  const neg = mode.haggle(run, lot);
  // Your opening number: 10¢ under (the Deal Lab opens at a fair number: pushing is your choice).
  let offer = round2(neg.ask() - (mode.openingGap ? mode.openingGap(run, lot, neg) : 0.10));
  let financed = false;
  // Venture Mode: every deal can be paid in cash (a deposit) or carried by the capital desk.
  const venture = !!mode.offersFinance;
  let capitalOpen = false;
  let closed = false;
  lot.engaged = true;

  const node = el(`
    <div class="sheet-scrim">
      <div class="lotsheet" role="dialog" aria-modal="true" aria-label="Lot sheet: ${esc(seller.firm)}">
        <header class="ls-head side-${seller.side}">
          <span class="ls-fig">${figureSVG(seller)}</span>
          <div class="ls-who">
            <div class="ls-kicker ui">LOT SHEET · ${lot.confirmed ? 'HOUSE CONFIRMED ✓' : 'UNCONFIRMED'}</div>
            <div class="ls-name hl">${esc(seller.name)} · ${esc(seller.firm)}</div>
            <div class="ls-bubble"><span class="ls-say hl-cond"></span></div>
            <div class="ls-mood ui" hidden></div>
          </div>
          <button class="ls-x btn" type="button" aria-label="Back to the floor">✕</button>
        </header>
        <div class="ls-fuse" hidden><span class="ls-fuse-bar"><i></i></span><span class="ls-fuse-t ui"></span></div>
        <div class="ls-main">
          <section class="ls-paper paper">
            <dl class="ls-grid">
              <dt>Product</dt><dd class="v-prod"></dd>
              <dt>Site</dt><dd>${esc(lot.siteLabel)}</dd>
              <dt>Delivery</dt><dd class="v-deliv"></dd>
              <dt>Terms</dt><dd>${lot.terms.map((t) => `${t} mo`).join(' · ')}</dd>
              <dt>Posted</dt><dd class="v-posted"></dd>
            </dl>
            <div class="ls-tip" hidden></div>
            <hr class="rule">
            <div class="ls-need ui">${needLine()}</div>
          </section>
          <section class="ls-tape crt">
            <div class="tape-h">THE TAPE</div>
            <ol class="tape"></ol>
          </section>
        </div>
        <div class="ls-controls"></div>
        <div class="ls-capital" hidden></div>
      </div>
    </div>`);
  host.appendChild(node);
  const sheet = $(node, '.lotsheet');
  const controls = $(node, '.ls-controls');
  const capBox = $(node, '.ls-capital');

  function needLine() {
    if (mode.needLine) return mode.needLine(run, lot); // the Deal Lab adds how long you'll use it
    const need = mode.need(run);
    if (!venture) return `YOUR NEED SHEET · ${int(need)} ${md.gpu} to go · target ${usd(md.target)} · walk ${usd(md.walk)}`;
    return need > 0
      ? `${esc(md.objective)} · ${int(need)} ${md.gpu} to go · target ${usd(md.target)} · walk ${usd(md.walk)}`
      : `NEED MET · this would be an optional trade: buy it only if the company can use it`;
  }

  function payRow(rate) {
    if (!venture) return '';
    const cash = mode.cost(run, { ...dealSpec(rate), financed: false });
    const fee = round2(mode.financingFee(neg.term) + mode.spread(run));
    return `<div class="ctl-row pay-row"><span class="ctl-l ui">PAY</span>
      <button class="chip ${financed ? '' : 'on'}" data-pay="cash" type="button">CASH <small>$${(cash.deposit / 1e6).toFixed(1)}M down</small></button>
      <button class="chip ${financed ? 'on' : ''}" data-pay="capital" type="button">CAPITAL DESK <small>+${usd(fee)}/hr, every quarter</small></button>
    </div>`;
  }

  // ---- Paint ---------------------------------------------------------------
  function paintPaper() {
    $(node, '.ls-need').innerHTML = needLine();
    if (mode.prodLine) $(node, '.v-prod').innerHTML = mode.prodLine(run, lot); // Tycoon: the GPU's badge and its fit
    else $(node, '.v-prod').textContent = `${int(lot.qty)} × ${lot.gpu}${lot.divisible ? ` (min ${int(lot.minQty)})` : ' · whole block'}`;
    $(node, '.v-deliv').textContent = lot.delivery === 0 ? 'Today' : `${lot.deliveryLabel.toLowerCase()} (${lot.delivery}d)`;
    $(node, '.v-deliv').classList.toggle('bad', lot.delivery > md.deliveryDays);
    $(node, '.v-posted').textContent = `${usd(lot.ask)} on ${lot.baseTerm} mo`;
    const hint = mode.tipFor ? mode.tipFor(run, lot) : null; // the Deal Lab's House tip names a want, not a floor
    if (hint) { const tip = $(node, '.ls-tip'); tip.hidden = false; tip.textContent = hint; }
    if (lot.tipped) {
      const tip = $(node, '.ls-tip');
      tip.hidden = false;
      tip.textContent = `The expert says: about ${usd(m.floorAt(lot, lot.baseTerm))} on ${lot.baseTerm} months.`;
    }
  }

  function paintTape() {
    const items = neg.tape.slice(-7).map((e) => `
      <li class="${e.who}"><span class="who">${e.who === 'you' ? 'YOU' : 'SELLER'}</span><span class="p">${usd(e.price)}</span><span class="t">${esc(e.text)}</span></li>`).join('');
    $(node, '.tape').innerHTML = items;
    const said = neg.tape.filter((e) => e.who === 'seller');
    const last = said[said.length - 1];
    $(node, '.ls-say').textContent = last ? last.text.toUpperCase() : '';
    // The Deal Lab flags a seller's drop when a move of yours lands (the size of the drop is the tell).
    if (mode.dropBadge && said.length > 1) {
      const drop = round2(said[said.length - 2].price - last.price);
      const old = $(node, '.ls-drop');
      if (old) old.remove();
      if (drop >= mode.dropBadge) $(node, '.ls-bubble').insertAdjacentHTML('beforeend', `<span class="ls-drop ui">−${Math.round(drop * 100)}¢</span>`);
    }
    sheet.classList.remove('talk');
    void sheet.offsetWidth;
    sheet.classList.add('talk');
    paintMood();
  }

  // The Deal Lab shows the seller's mood (how much patience is left, a deadline); other modes have none.
  let moodText = null;
  function paintMood() {
    if (!mode.mood) return;
    const md2 = mode.mood(run, lot, neg);
    const box = $(node, '.ls-mood');
    const text = md2 ? md2.text : '';
    if (text === moodText) return;
    moodText = text;
    box.hidden = !md2;
    box.textContent = text;
    box.className = `ls-mood ui ${md2 ? md2.cls || '' : ''}`;
  }

  function dealSpec(rate) {
    return { gpu: lot.gpu, qty: neg.qty, term: neg.term, rate, delivery: lot.delivery, financed };
  }

  function checksHTML(chk) {
    return `<ul class="checks">${chk.items.map((i) => `<li class="${i.ok ? 'ok' : i.warn ? 'warn' : 'no'}">${i.ok ? '✓' : i.warn ? '!' : '✕'} ${esc(i.label)}</li>`).join('')}</ul>`;
  }

  function paintControls() {
    if (closed) return;
    const st = neg.status;
    if (st === 'open') {
      const ask = neg.ask();
      offer = round2(Math.min(offer, ask - 0.01));
      const chk = mode.checks(run, dealSpec(ask));
      const qtyOpts = mode.qtyOptions(lot, run);
      const offerCls = offer <= md.target ? 'ok' : offer <= md.walk ? 'warn' : 'no';
      controls.innerHTML = `
        ${mode.offerCard ? mode.offerCard(run, lot, neg) : ''}
        ${lot.terms.length > 1 ? `
        <div class="ctl-row"><span class="ctl-l ui">TERM</span>
          ${lot.terms.map((t) => { const at = round2(Math.max(neg.floor(t), m.askAt(lot, t) - neg.conceded)); return `<button class="chip ${t === neg.term ? 'on' : ''}" data-term="${t}" type="button">${t} mo <small>${usd(mode.chipPrice ? mode.chipPrice(run, lot, neg, t, at) : at)}</small></button>`; }).join('')}
        </div>` : ''}
        ${qtyOpts.length > 1 ? `
        <div class="ctl-row"><span class="ctl-l ui">QTY</span>
          ${qtyOpts.map((q) => `<button class="chip ${q === neg.qty ? 'on' : ''}" data-qty="${q}" type="button">${int(q)}</button>`).join('')}
        </div>` : ''}
        <div class="ctl-row num-row">
          <span class="ctl-l ui">YOUR NUMBER</span>
          <button class="step btn" data-d="-0.05" type="button">−5¢</button>
          <button class="step btn" data-d="-0.01" type="button">−1¢</button>
          <output class="offer ${offerCls}">${usd(offer)}${mode.offerTag && mode.offerTag(run, lot, neg, offer) ? `<small class="offer-tag">${esc(mode.offerTag(run, lot, neg, offer))}</small>` : ''}</output>
          <button class="step btn" data-d="0.01" type="button">+1¢</button>
          <button class="step btn" data-d="0.05" type="button">+5¢</button>
        </div>
        <div class="ctl-row act-row">
          <button class="btn big default counter" type="button">COUNTER ${usd(offer)}</button>
          <button class="btn big spot take" type="button">TAKE ${usd(ask)}</button>
          <button class="btn walk" type="button">WALK</button>
        </div>
        ${mode.costLine ? mode.costLine(run, dealSpec(ask)) : ''}
        ${payRow(ask)}
        <div class="ctl-row check-row"><span class="ctl-l ui">AT ${usd(ask)}</span>${checksHTML(chk)}</div>
        ${chk.overBudget && !venture ? `<div class="ctl-row cap-row"><span>${esc(int(neg.qty))} × ${usd(ask)} × ${neg.term} mo is over budget.</span><button class="btn ink call-cap" type="button">CALL THE CAPITAL DESK</button></div>` : ''}
        <p class="keys ui">↑↓ ±1¢ · Shift ±5¢ · Enter counter · T take · Esc walk</p>`;
    } else if (st === 'agreed') {
      const chk = mode.checks(run, dealSpec(neg.price));
      const blocked = chk.overBudget;
      controls.innerHTML = `
        <div class="agreed">
          <div class="agreed-hl hl-cond">Deal at ${usd(neg.price)}</div>
          <div class="agreed-sub">${int(neg.qty)} × ${lot.gpu} · ${neg.term} months · contract value $${int(contractValue(neg.qty, neg.price, neg.term))}${financed ? ` · financed, effective ${usd(chk.eff)}` : ''}</div>
          ${payRow(neg.price)}
          ${checksHTML(chk)}
          <div class="ctl-row act-row">
            ${blocked
              ? (venture ? `<button class="btn big ink" type="button" disabled>${financed ? 'OVER THE CAPITAL LINE' : 'DEPOSIT OVER CASH: TRY THE CAPITAL DESK'}</button>` : '<button class="btn big ink call-cap" type="button">OVER BUDGET: CALL THE CAPITAL DESK</button>')
              : '<button class="btn big default spot sign" type="button">TO THE SIGNING ROOM →</button>'}
            <button class="btn back-out" type="button">BACK OUT</button>
          </div>
        </div>`;
    } else {
      const lost = st === 'lost';
      controls.innerHTML = `
        <div class="ended ${lost ? 'lost' : ''}">
          <div class="ended-hl hl-cond">${lost ? 'Capacity no longer available.' : 'They walked.'}</div>
          <p>${lost ? 'Should’ve closed.' : 'Push a seller under their floor too often and they stop picking up. They’ll cool off.'}</p>
          <button class="btn big ink done" type="button">BACK TO THE FLOOR</button>
        </div>`;
    }
  }

  function paintFuse() {
    const f = lot.fuse;
    const box = $(node, '.ls-fuse');
    const on = f && !f.done && neg.status !== 'lost' && lot.status !== 'gone';
    box.hidden = !on;
    if (!on) return;
    const left = Math.max(0, f.endsAt - m.t);
    $(box, 'i').style.width = `${(left / f.total) * 100}%`;
    $(box, '.ls-fuse-t').textContent = `${(f.rival?.firm || 'A rival').toUpperCase()} IS CIRCLING THIS LOT · ${mmss(left)}`;
    box.classList.toggle('urgent', left <= 15);
  }

  function paintAll() { paintPaper(); paintTape(); paintControls(); paintFuse(); }

  // ---- Capital desk ----------------------------------------------------------
  function openCapital() {
    capitalOpen = true;
    const rate = neg.status === 'agreed' ? neg.price : neg.ask();
    const fee = mode.financingFee(neg.term);
    const value = contractValue(neg.qty, rate, neg.term);
    const gap = value - mode.budgetLeft(run);
    capBox.hidden = false;
    capBox.innerHTML = `
      <div class="cap side-money">
        <span class="cap-fig">${figureSVG(capital)}</span>
        <div class="cap-body">
          <div class="ls-kicker ui">THE MONEY · ${esc(capital.firm.toUpperCase())}</div>
          <div class="cap-say hl-cond">“We can finance that.”</div>
          <p>We carry the $${(gap / 1e6).toFixed(1)}M gap on a ${neg.term}-month commitment. You pay monthly.</p>
          <p class="cap-terms"><b>Fee +${usd(fee)}/GPU-hr</b> → effective <b>${usd(round2(rate + fee))}</b>. Underwritten in four seconds.</p>
          <div class="ctl-row">
            <button class="btn big spot take-fin" type="button">TAKE THE FINANCING</button>
            <button class="btn no-fin" type="button">NO THANKS</button>
          </div>
        </div>
      </div>`;
    ctx.audio.blip(880, 0.05);
    $(capBox, '.take-fin').addEventListener('click', () => {
      financed = true;
      capitalOpen = false;
      capBox.hidden = true;
      neg.tape.push({ who: 'seller', price: rate, text: `Capital desk is in. +${usd(fee)}.`, kind: 'fin' });
      ctx.audio.stamp();
      paintAll();
    });
    $(capBox, '.no-fin').addEventListener('click', () => { capitalOpen = false; capBox.hidden = true; });
  }

  // ---- Actions ---------------------------------------------------------------
  function act(entry) {
    if (!entry) return;
    paintAll();
    if (neg.status === 'agreed') { ctx.audio.bell({ strikes: 1, f: 990, ring: 1.2 }); }
    else if (neg.status === 'walked') { ctx.audio.buzz(); m.cool(lot, 20); }
    else ctx.audio.tap();
  }

  controls.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.offer) act(mode.takeOffer(run, lot, neg, Number(b.dataset.offer))); // the Deal Lab's long-tenant offer
    else if (b.dataset.term) act(neg.setTerm(Number(b.dataset.term)));
    else if (b.dataset.qty) { act(neg.setQty(Number(b.dataset.qty))); }
    else if (b.dataset.pay) { financed = b.dataset.pay === 'capital'; ctx.audio.tap(); paintAll(); }
    else if (b.dataset.d) { offer = round2(offer + Number(b.dataset.d)); ctx.audio.blip(1500, 0.03); paintControls(); }
    else if (b.classList.contains('counter')) act(neg.counter(offer));
    else if (b.classList.contains('take')) act(neg.accept());
    else if (b.classList.contains('walk')) { close(); }
    else if (b.classList.contains('call-cap')) openCapital();
    else if (b.classList.contains('sign')) sign();
    else if (b.classList.contains('back-out')) { neg.status = 'walked'; m.cool(lot, 25); mode.onBackOut?.(run, lot); ctx.audio.buzz(); close(); }
    else if (b.classList.contains('done')) close();
  });
  $(node, '.ls-x').addEventListener('click', () => close());
  node.addEventListener('click', (e) => { if (e.target === node) close(); });

  function onKey(e) {
    if (closed) return;
    if (capitalOpen) {
      if (e.key === 'Escape') { e.preventDefault(); capitalOpen = false; capBox.hidden = true; }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    // A focused button already handles Enter natively.
    if (e.key === 'Enter' && e.target.closest?.('button')) return;
    if (neg.status !== 'open') { if (e.key === 'Enter' && neg.status === 'agreed') { const s = $(node, '.sign'); if (s) s.click(); } return; }
    const big = e.shiftKey ? 0.05 : 0.01;
    if (e.key === 'ArrowUp') { e.preventDefault(); offer = round2(offer + big); paintControls(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); offer = round2(offer - big); paintControls(); }
    else if (e.key === 'Enter') { e.preventDefault(); act(neg.counter(offer)); }
    else if (e.key === 't' || e.key === 'T') { act(neg.accept()); }
  }
  window.addEventListener('keydown', onKey);

  function sign() {
    const deal = mode.lotDeal(run, lot, { qty: neg.qty, term: neg.term, rate: neg.price, financed, seller: seller.name, rounds: neg.round });
    close(true);
    onSign(deal);
  }

  function close(signed = false) {
    if (closed) return;
    closed = true;
    lot.engaged = false;
    window.removeEventListener('keydown', onKey);
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 180);
    onClose({ signed, status: neg.status });
  }

  paintAll();
  setTimeout(() => $(node, '.counter')?.focus({ preventScroll: true }), 50);

  return {
    lot,
    update() {
      if (closed) return;
      const moved = neg.checkMarket();
      if (moved) { paintAll(); shake(sheet); ctx.audio.alert(); }
      paintFuse();
      paintMood();
    },
    refresh() { if (!closed) paintAll(); },
    lose() {
      if (closed) return;
      neg.lose();
      neg.tape.push({ who: 'seller', price: lot.ask, text: 'Sorry. Paper beats talk. Sold.', kind: 'lost' });
      paintAll();
      shake(sheet);
      ctx.audio.buzz();
    },
    close: () => close(),
    get closed() { return closed; },
  };
}
