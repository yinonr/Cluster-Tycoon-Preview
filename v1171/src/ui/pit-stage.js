// The founder's floor: a HUD that never dims, the trading room (supplier booths, the investor's
// booth, the tape, the resale desk, the market ledger and the bell) and YOUR COMPANY board.
// Every counterparty is an engine record; presentation never reserves, ranks by margin, or
// changes the finite market.
import { figureSVG } from './character.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cents, owned, V7 } from '../tycoon/arcade.js';
import { buyerLive } from '../tycoon/arcade-buyers.js';
import { liveTerm } from '../tycoon/investors.js';
import { rivalQuotes } from '../tycoon/arcade-negotiation.js';
import { companyStats, openCards, cardState, executionOf } from '../tycoon/founder.js';
import { money as sum, short, pctOf, bpsText, phaseName, plural } from './pit-ledger.js';
import { companyBoard, cardStrip, trayRow, gpuTag } from './pit-company.js';
import { tapeOffer } from './scenarios.js';

// HUD cash always shows cents (pit-fx rolls it in that format).
const money = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c / 100);
const faceOf = name => [...String(name || 'HSC')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
const rate = n => `$${(n / 100).toFixed(2)}`;
const gpu = name => `<span class="pit-gpu gpu-${esc(name.toLowerCase())}">${esc(name)}</span>`;
const button = (action, text, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${text}</button>`;
// While a desk is open the room is an inert backdrop: no duplicate data-action controls.
const control = (live, action, cls, inner, attrs = '') => live ? `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${inner}</button>` : `<span class="${cls}">${inner}</span>`;
const buyerQty = b => Math.max(0, Math.min(b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))));

// A fuse is the real time window: the controller rewrites its text and --left every 250ms.
function fuse(until, at, now, cls = '') {
  const left = Math.max(0, until - now), span = Math.max(1, until - at);
  return `<span class="pit-fuse ${cls} ${left < 8 ? 'is-short' : ''}" data-fuse style="--left:${Math.min(1, left / span).toFixed(3)}"><b data-station-until="${until}" data-station-at="${at}">${Math.ceil(left)}s</b></span>`;
}

export function person(role, name, { paddle = false } = {}) {
  const i = faceOf(name), investor = role === 'capital' || role === 'investor';
  return figureSVG({ badge: investor ? 'VC' : role === 'seller' ? 'SUPPLY' : role === 'buyer' ? 'BUYER' : 'HSC', look: {
    skin: ['#DDA67C', '#BC8059', '#875038', '#E9BA96'][i % 4],
    hair: ['#30241C', '#5B372A', '#B0A393', '#171C21'][Math.floor(i / 5) % 4],
    hairStyle: ['slick', 'bob', 'curly', 'short', 'bighair', 'bald'][Math.floor(i / 11) % 6],
    suit: investor ? ['#2E3A55', '#3B3247', '#24423A'][Math.floor(i / 17) % 3] : role === 'seller' ? ['#486957', '#3C625F', '#67714D'][Math.floor(i / 17) % 3] : role === 'buyer' ? ['#6D4E68', '#765344', '#4C5A73'][Math.floor(i / 17) % 3] : '#465B70',
    shirt: '#F4EBD6', tie: investor ? '#C9A13B' : ['#B6472C', '#C7A44E', '#284C58'][i % 3], glasses: !!(i % 2), phone: role === 'seller', paddle: paddle || role === 'buyer'
  } });
}

// GPUs some open card still needs: a relevance cue only (never a price ranking).
export function neededGPUs(g) {
  const need = new Set();
  if (g.phase !== 'floor') return need;
  for (const o of openCards(g)) for (const r of cardState(g, o).rows) if (r.held < r.need) need.add(r.gpu);
  return need;
}

// Booths seat live lots: held blocks first (the relationship paying off), then lots of a GPU your
// cards still need, then the rest, in engine order. The lot at your desk keeps its (vacated) booth.
// V10.17.1: the bell shows the execution bonus it would bring (only with projects built this round).
const fastClose = g => g.phase === 'floor' && g.company.builds.some(b => b.q === g.q) ? Math.round(executionOf(g.arcade.time, V7.seconds) * 100) : 0;
function seating(g) {
  const a = g.arcade, t = a.time, need = neededGPUs(g);
  const live = a.lots.filter(l => g.phase === 'floor' && l.status === 'open' && l.at <= t && l.until > t);
  // V10.15: blocks (and sourced blocks) sit with held lots at the front: the big deals lead.
  const lead = l => l.favor || l.block;
  let list = [...live.filter(lead), ...live.filter(l => !lead(l) && need.has(l.gpu)), ...live.filter(l => !lead(l) && !need.has(l.gpu))].slice(0, 4);
  const at = activeLot(g);
  if (at && !list.includes(at)) list = [at, ...list].slice(0, 4);
  return { list, need, live };
}

function station(g, l, seatName, ctx) {
  const a = g.arcade, t = a.time, price = l.negotiation?.price ?? l.ask, opening = l.ask;
  const vacated = ctx.open && a.active === l.id, cooling = !vacated && l.cooldown > t, rival = ctx.open && l.id === ctx.rivalId;
  const live = !ctx.open && !cooling, worked = price !== opening, favor = l.favor, needed = ctx.need.has(l.gpu);
  const cls = `pit-station seller seat-${seatName} ${needed ? 'is-relevant' : ''} ${vacated ? 'is-vacated' : ''} ${cooling ? 'is-cooling' : ''} ${rival ? 'is-rival' : ''} ${worked ? 'is-worked' : ''} ${favor ? 'is-favor' : ''} ${l.event ? 'is-event' : ''} ${l.block ? 'is-block' : ''}`;
  const screen = vacated
    ? `<span class="pit-crt-away">AT YOUR DESK</span>`
    : cooling
      ? `<span class="pit-crt-head">${l.qty} ${gpu(l.gpu)}</span><span class="pit-crt-away">BACK IN</span>${fuse(l.cooldown, l.cooldown - 5, t, 'is-cooldown')}`
      : `<span class="pit-crt-rate">${worked ? `<s>${rate(opening)}</s>` : ''}<b>${rate(price)}</b><small>/h</small></span><span class="pit-crt-head">${l.qty} ${gpu(l.gpu)}${needed ? '<em class="pit-need">NEEDED</em>' : ''}</span><span class="pit-crt-total">${sum(cents(l.qty, price))} lot</span>${fuse(l.until, l.at, t)}`;
  const label = `${favor ? `Held for you by ${l.firm} (Trust ${g.firms[l.firm]?.trust ?? 0}): ` : ''}${l.label ? `${l.label}: ` : ''}Supplier ${l.firm}: ${l.qty} ${l.gpu} at ${rate(price)} per GPU-hour, ${sum(cents(l.qty, price))} lot${needed ? ', a GPU your cards need' : ''}${cooling ? `, back in ${Math.ceil(l.cooldown - t)} seconds` : `, ${Math.ceil(Math.max(0, l.until - t))} seconds left`}`;
  const inner = `<span class="pit-station-person" aria-hidden="true">${vacated ? '' : person('seller', l.firm)}</span><span class="pit-crt">${screen}</span><span class="pit-station-plaque"><b>${esc(l.firm)}</b><small>${l.label ? esc(l.label.toUpperCase()) : favor ? 'HELD FOR YOU' : 'SUPPLIER'}</small></span>`;
  return live
    ? `<button type="button" class="${cls}" data-action="focus-supplier" data-id="${esc(l.id)}" data-station-id="${esc(l.id)}" aria-label="${esc(label)}">${inner}</button>`
    : `<div class="${cls}" data-station-id="${esc(l.id)}" ${ctx.open ? 'aria-hidden="true"' : `role="group" aria-label="${esc(label)}"`}>${inner}</div>`;
}

const emptyBooth = seatName => `<div class="pit-station seller seat-${seatName} is-empty" aria-hidden="true"><span class="pit-station-person"></span><span class="pit-crt"><span class="pit-crt-away">NO QUOTE</span></span><span class="pit-station-plaque"><b>Open booth</b><small>SUPPLIER</small></span></div>`;

// The investor's booth: a term sheet on green baize, the check first, then the slice.
function investorBooth(g, t, open) {
  if (!t) return '';
  const now = g.arcade.time, away = open && g.arcade.confirm?.termId === t.id;
  const two = g.arcade.terms.filter(x => x.status === 'open' && x.at <= now && now < x.until).length > 1;
  const label = `${t.label} ${t.name}: ${sum(t.amount)} for ${bpsText(t.pct)} of the company.${two ? ' A rival offer is on the table too.' : ''} ${Math.ceil(Math.max(0, t.until - now))} seconds left. Review the term sheet`;
  const inner = `<span class="ib-person" aria-hidden="true">${away ? '' : person('investor', t.name)}</span><span class="ib-tag">${two ? '2 OFFERS' : 'TERM SHEET'}</span>` +
    `<span class="ib-sheet">${away ? '<span class="pit-crt-away">AT YOUR DESK</span>' : `<span class="ib-kind">${esc(t.label.toUpperCase())}</span><b class="ib-check">${sum(t.amount)}</b><span class="ib-for">for <b>${bpsText(t.pct)}</b><span class="ib-long"> of the company</span></span>${fuse(t.until, t.at, now, 'is-term')}`}</span>` +
    `<span class="ib-name"><b>${esc(t.name)}</b></span>`;
  return open ? `<div class="pit-investor ${away ? 'is-vacated' : ''}" data-station-id="${esc(t.id)}" aria-hidden="true">${inner}</div>`
    : `<button type="button" class="pit-investor" data-action="review-term" data-id="${esc(t.id)}" data-station-id="${esc(t.id)}" aria-label="${esc(label)}">${inner}</button>`;
}

// The resale desk: two or three funded spot bids for spare capacity, as small tickets.
function resaleTickets(g, open) {
  const a = g.arcade, bids = a.buyers.filter(b => buyerLive(g, b));
  const ticket = b => {
    const qty = buyerQty(b), free = owned(g, b.gpu), label = `Resale bid from ${b.name}: ${qty} ${b.gpu} at ${rate(b.rate)} per GPU-hour, ${sum(cents(qty, b.rate))} funded. You hold ${free} free ${b.gpu}. ${Math.ceil(Math.max(0, b.until - a.time))} seconds left`;
    const inner = `<span class="rt-who">${esc(b.name)}</span><span class="rt-want"><b>${qty}</b> ${gpu(b.gpu)} <b>${rate(b.rate)}</b><small>/h</small></span><span class="rt-own ${free ? 'has-stock' : ''}">${free ? `you have ${free} free` : 'none free'}</span>${fuse(b.until, b.at, a.time)}`;
    return open ? `<div class="resale-ticket gpu-${b.gpu.toLowerCase()} ${free ? 'has-stock' : ''}" data-station-id="${esc(b.id)}" aria-hidden="true">${inner}</div>`
      : `<button type="button" class="resale-ticket gpu-${b.gpu.toLowerCase()} ${free ? 'has-stock' : ''}" data-action="focus-buyer" data-id="${esc(b.id)}" data-station-id="${esc(b.id)}" aria-label="${esc(label)}">${inner}</button>`;
  };
  return `<div class="rest-resale" role="group" aria-label="Resale desk"><span class="rest-tag">RESALE<i> DESK</i></span>${bids.length ? bids.slice(0, 3).map(ticket).join('') : '<span class="rest-none">No resale bids right now</span>'}</div>`;
}

function hud(g, ui, open) {
  const s = companyStats(g), a = g.arcade, clock = Math.max(0, Math.ceil(V7.seconds - a.time)), phase = phaseName(g.q), cashC = cash(g);
  const runway = s.runway === Infinity ? 'Profitable' : `${s.prepaid ? 'Cash runway' : 'Runway'} ${plural(s.runway, 'rd')}`;
  const red = s.runway !== Infinity && s.runway < 2;
  return `<header class="pit-hud ${cashC >= 10000000 ? 'has-large-cash' : ''} ${cashC >= 100000000 ? 'has-huge-cash' : ''} ${open ? 'is-paused' : ''}">
      <div class="hud-co"><button class="pit-help" data-action="help" aria-label="Help" title="How to Play" ${activeLot(g)?.negotiation.running ? 'disabled' : ''}>?</button><span class="hud-name"><b title="${esc(s.name)}">${esc(s.name)}</b><span class="hud-chips"><i class="hud-stage ${s.scale >= 2 ? `is-scale-${s.scale}` : ''}" title="${s.scale >= 2 ? `${esc(s.scaleName)}: block suppliers${s.scale === 3 ? ', AI Giant projects' : ', flagship projects'}` : 'Startup'}">${esc((s.scale >= 2 ? s.scaleName : s.stage).toUpperCase())}</i><i class="hud-model-inline">${esc(s.model)}</i></span></span></div>
      <div class="hud-cash"><span>CASH</span><strong data-fx-cash>${money(cashC)}</strong></div>
      <div class="hud-val" title="Estimated paper stake, not final payout" aria-label="Estimated paper stake ${short(s.founderValue)}; you own ${pctOf(s.founderPct)}"><span>YOUR STAKE</span><strong data-paper-stake="${s.founderValue}">${short(s.founderValue)}</strong><small>est. · <b>${pctOf(s.founderPct)}</b></small></div>
      <div class="hud-flow ${red ? 'is-red' : ''}" aria-label="Revenue ${sum(s.revenue)} a round, burn ${sum(s.burn)} a round. ${runway}"><span>REVENUE · BURN<i> / RD</i></span><strong><i class="rev"><span class="full">${sum(s.revenue)}</span><span class="short">+${short(s.revenue)}</span></i><i class="sep">·</i><i class="burn"><span class="full">${sum(s.burn)}</span><span class="short">−${short(s.burn)}</span></i></strong><small>${runway}</small></div>
      <div class="hud-model"><span>MODEL</span><strong>${esc(s.model)}</strong></div>
      <div class="hud-round" aria-label="Round ${g.q} of ${V7.rounds}: ${esc(phase)}"><span>ROUND<em> · ${esc(phase.toUpperCase())}</em></span><strong>${g.q}<small>/${V7.rounds}</small></strong></div>
      ${g.phase !== 'floor' ? '<div class="pit-clock is-paused is-closed" title="The bell has rung for this round"><span>FLOOR</span><strong>CLOSED</strong></div>' : `<div class="pit-clock ${open ? 'is-paused' : ''}" ${open ? 'title="Floor paused while you read"' : ''}><span>${open ? 'PAUSED' : 'FLOOR'}</span><strong data-floor-clock>${clock}s</strong></div>`}
      ${button('sound', `<span class="pit-sound-icon" aria-hidden="true">${ui.sound ? '♫' : '♪'}</span><span class="pit-sound-text" aria-hidden="true">${ui.sound ? 'Sound on' : 'Sound off'}</span>`, `class="pit-sound ${ui.sound ? 'is-on' : ''}" aria-label="Sound ${ui.sound ? 'on; turn off' : 'off; turn on'}" aria-pressed="${!!ui.sound}"`)}
    </header>`;
}

export function stage(g, ui = {}) {
  const a = g.arcade, open = !!ui.focusOpen, live = !open, t = a.time;
  const { list, need, live: lots } = seating(g), term = g.phase === 'floor' ? liveTerm(g) || (open && a.confirm?.termId ? a.terms.find(x => x.id === a.confirm.termId) : null) : null;
  const l = activeLot(g), rivalId = open && l?.status === 'open' ? rivalQuotes(g)[0]?.id : null;
  const ctx = { open, need, rivalId };
  const booths = ['s0', 's1', 's2', 's3'].map((seat, i) => list[i] ? station(g, list[i], seat, ctx) : emptyBooth(seat)).join('');
  const bids = a.buyers.filter(b => buyerLive(g, b));
  const upcoming = [...a.lots, ...a.buyers, ...a.terms.filter(x => x.status === 'open')].filter(x => x.at > t).sort((x, y) => x.at - y.at)[0];
  const lastArrival = Math.max(0, ...[...a.lots, ...a.buyers].filter(x => x.at <= t).map(x => x.at));
  const ev = a.event || { kind: 'quiet', text: '' }, phase = phaseName(g.q), lead = g.phase === 'floor' ? (a.news || []).find(n => n.size === 'major') || (a.news || [])[0] : null;
  const liveCount = lots.length + bids.length;
  return `<section class="pit-stage ${open ? 'is-backdrop' : ''} ${term ? 'has-term' : ''}" aria-label="Haight Street Compute: your company and the GPU floor">
    ${hud(g, ui, open)}
    <div class="pit-main">
      <div class="pit-phone-company">${trayRow(g)}${cardStrip(g, live)}</div>
      <div class="pit-room">
        <div class="pit-tape" role="group" aria-label="The tape">
          <span class="tape-phase">R${g.q} · ${esc(phase.toUpperCase())}</span>
          ${g.phase === 'floor' ? tapeOffer(g, live) : ''}
          ${lead ? `<span class="tape-event has-news tone-${esc(lead.tone)}"><i class="tape-news">NEWS</i><span>${esc(lead.headline)}</span>${ev.kind !== 'quiet' ? `<i class="tape-mkt kind-${esc(ev.kind)}">${esc(ev.gpu)} ${esc(ev.kind)}</i>` : ''}</span>`
            : `<span class="tape-event kind-${esc(ev.kind)}">${ev.gpu ? gpuTag(ev.gpu) : ''}<span>${esc(ev.gpu ? ev.text.replace(`${ev.gpu} `, '') : ev.text)}</span></span>`}
          <span class="tape-count"><b>${lots.length}</b> ${lots.length === 1 ? 'lot' : 'lots'}</span>
          ${upcoming && g.phase === 'floor' ? `<span class="tape-next">next<span class="tape-long"> ${a.lots.includes(upcoming) ? 'suppliers' : a.buyers.includes(upcoming) ? 'buyer' : 'offer'} ·</span> ${fuse(upcoming.at, lastArrival, t, 'is-next')}</span>` : '<span class="tape-next">no more arrivals</span>'}
        </div>
        <div class="pit-hall">
          <div class="pit-architecture" aria-hidden="true"><div class="pit-coffer"></div><div class="pit-column column-left"></div><div class="pit-column column-right"></div><div class="pit-marble"></div><div class="pit-balustrade"></div></div>
          <div class="pit-center" aria-hidden="true"><div class="pit-center-inset"><b>HSC</b></div></div>
          <div class="pit-stations">${booths}${investorBooth(g, term, open)}</div>
        </div>
        <div class="pit-desk-rest">
          ${resaleTickets(g, open)}
          ${control(live, 'open-market', 'pit-resale-btn', `<span class="pit-ledger-tag">RESALE</span><b>${bids.length} ${bids.length === 1 ? 'bid' : 'bids'}</b>`, `data-filter="buyers" aria-label="Resale desk: ${bids.length} funded bids for spare capacity"`)}
          ${control(live, 'open-market', 'pit-ledger', `<span class="pit-ledger-tag">MARKET</span><b>${liveCount} live</b><i aria-hidden="true">→</i>`, `data-filter="all" aria-label="Market ledger: ${liveCount} live lots and bids"`)}
          ${control(live, 'finish-review', 'pit-bell', `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6c-1.4 0-2.4 1-2.4 2.3v1.1C11.9 10.6 9 15.3 9 21v6.2L5.8 31h28.4L31 27.2V21c0-5.7-2.9-10.4-8.6-11.6V8.3C22.4 7 21.4 6 20 6z"/><circle cx="20" cy="33.4" r="3"/></svg><span>End round${fastClose(g) ? `<small class="bell-fast">+${fastClose(g)}% fast close</small>` : ''}</span>`, 'aria-label="End round: ring the bell"')}
        </div>
      </div>
      <aside class="pit-board">${companyBoard(g, ui, live)}</aside>
    </div>
  </section>`;
}

// The desk frame: no modal over a blurred room. A dock below the never-dimmed HUD holds a
// band (the counterparty at the far edge of your desk), the desk instrument and the rail.
export function focusFrame(g, view) {
  const identity = view.identity, identityRole = identity?.role || view.role || 'capital';
  const role = ['seller', 'buyer', 'startup', 'capital', 'investor'].includes(identityRole) ? identityRole : 'capital';
  const desk = view.desk || (identity ? 'deal' : 'paper');
  const exit = view.exit === null || g.phase !== 'floor' ? null : view.exit || { action: 'close-focus', label: 'Floor' };
  const roleName = identity?.tag ? identity.tag : role === 'seller' ? 'SUPPLIER' : role === 'buyer' ? 'RESALE BUYER' : role === 'investor' ? 'INVESTOR' : role === 'startup' ? 'FOUNDER' : 'CAPITAL';
  return `<div class="pit-focus-scrim ${identity ? 'has-band' : 'is-paper'}"><section class="pit-focus ${identity ? 'has-identity' : 'is-paper'} tone-${esc(view.tone || 'plain')} focus-${esc(view.role || 'deal')} desk-${esc(desk)}" data-desk="${esc(desk)}" role="dialog" aria-modal="true" aria-labelledby="focus-title" tabindex="-1">
    <header class="pit-focus-heading">${exit ? button(exit.action, `<span class="exit-arrow" aria-hidden="true"></span><span class="exit-label">${esc(exit.label)}</span>`, `class="pit-focus-close mat-exit" aria-label="${esc(exit.aria || exit.label)}"`) : ''}<h2 id="focus-title">${esc(view.title)}</h2></header>
    ${identity ? `<aside class="pit-counterparty ${role}" data-mood="${esc(identity.mood || 'neutral')}"><div class="pit-bust" data-fx-figure aria-hidden="true">${person(role, identity.name)}</div><div class="pit-bubble" data-fx-bubble>${identity.reaction ? `<strong class="pit-reaction">${esc(identity.reaction)}</strong>` : ''}${identity.line ? `<blockquote>“${esc(identity.line)}”</blockquote>` : ''}</div><div class="pit-nameplate"><span class="pit-counterparty-role">${roleName}</span><h3>${esc(identity.name)}</h3>${identity.subtitle ? `<p>${esc(identity.subtitle)}</p>` : ''}</div></aside>` : ''}
    <div class="pit-focus-body" data-desk="${esc(desk)}">${view.body || ''}</div>
    <footer class="pit-focus-footer">${view.footer || ''}</footer>
  </section></div>`;
}

// Page size follows the composition: two ledger columns of four on a desk, four rows on a phone.
const compact = () => { try { return matchMedia('(max-width: 760px)').matches; } catch { return false; } };

// The market ledger: every live lot and resale bid, optionally one GPU type.
export function directoryView(g, ui = {}) {
  const a = g.arcade, filter = ['supply', 'buyers'].includes(ui.marketFilter) ? ui.marketFilter : 'all', need = neededGPUs(g);
  const only = list => ui.gpu ? list.filter(({ item }) => item.gpu === ui.gpu) : list;
  const lots = a.lots.filter(l => available(g, l)), bids = a.buyers.filter(b => buyerLive(g, b));
  const suppliers = only(lots.map(item => ({ item, role: 'seller' }))), buyers = only(bids.map(item => ({ item, role: 'buyer' })));
  const row = ({ item, role }) => {
    const seller = role === 'seller', name = seller ? item.firm : item.name, qty = seller ? item.qty : buyerQty(item), price = seller ? item.negotiation?.price ?? item.ask : item.rate;
    const opening = seller ? item.ask : item.openingRate ?? item.rate, free = seller ? 0 : owned(g, item.gpu);
    const tag = seller ? item.favor ? `HELD FOR YOU · TRUST ${g.firms[item.firm]?.trust ?? 0}` : need.has(item.gpu) ? 'SUPPLIER · NEEDED' : 'SUPPLIER' : `RESALE BID · ${free} FREE`;
    return `<button type="button" class="pit-market-row ${role} gpu-${item.gpu.toLowerCase()} ${seller && need.has(item.gpu) ? 'is-relevant' : ''} ${item.favor ? 'is-favor' : ''}" data-action="${seller ? 'focus-supplier' : 'focus-buyer'}" data-id="${esc(item.id)}" aria-label="${seller ? 'Supplier' : 'Resale bid'} ${esc(name)}: ${qty} ${esc(item.gpu)} at ${rate(price)} per GPU-hour, ${sum(cents(qty, price))} ${seller ? 'lot' : `funded; you hold ${free} free`}, ${Math.ceil(Math.max(0, item.until - a.time))} seconds left"><span class="pit-market-face" aria-hidden="true">${person(role, name)}</span><span class="pit-market-who"><small class="pit-market-role">${tag}</small><b>${esc(name)}</b></span><strong class="pit-market-rate">${price !== opening ? `<s>${rate(opening)}</s>` : ''}${rate(price)}<small>/h</small></strong><span class="pit-market-lot"><span>${qty} ${gpu(item.gpu)}</span><span class="pit-dot">${sum(cents(qty, price))}</span></span>${fuse(item.until, item.at, a.time)}</button>`;
  };
  const split = !compact() && filter === 'all', size = split ? 4 : compact() ? 4 : 8;
  const entries = filter === 'supply' ? suppliers : filter === 'buyers' ? buyers : Array.from({ length: Math.max(suppliers.length, buyers.length) }, (_, i) => [suppliers[i], buyers[i]]).flat().filter(Boolean);
  const pages = Math.max(1, split ? Math.ceil(Math.max(suppliers.length, buyers.length) / size) : Math.ceil(entries.length / size)), page = Math.max(0, Math.min(pages - 1, Number(ui.page) || 0));
  const cut = list => list.slice(page * size, page * size + size);
  const empty = `<p class="pit-market-empty">${filter === 'buyers' ? 'No resale bids in this view. New bids arrive during the round.' : 'No live quotes in this view. New lots arrive during the round.'}</p>`;
  const list = !entries.length ? `<div class="pit-market-list">${empty}</div>`
    : split ? `<div class="pit-market-list is-split"><div class="pit-market-col seller"><h3>Suppliers</h3>${cut(suppliers).map(row).join('')}</div><div class="pit-market-col buyer"><h3>Resale bids</h3>${cut(buyers).map(row).join('') || '<p class="pit-market-empty">None live</p>'}</div></div>`
    : `<div class="pit-market-list">${cut(entries).map(row).join('')}</div>`;
  const filters = [['all', 'All', lots.length + bids.length], ['supply', 'Suppliers', lots.length], ['buyers', 'Resale', bids.length]];
  const title = filter === 'buyers' ? (ui.gpu ? `${ui.gpu} resale bids` : 'Resale desk') : ui.gpu ? `${ui.gpu} on the floor` : 'Market ledger';
  return { title, role: 'market', desk: 'ledger',
    body: `<div class="pit-directory"><nav class="pit-market-filters" aria-label="Market view">${filters.map(([key, label, n]) => button('open-market', `${label} <b>${n}</b>`, `class="pit-tab" data-filter="${key}" ${ui.gpu ? `data-gpu="${esc(ui.gpu)}"` : ''} aria-pressed="${filter === key}"`)).join('')}${ui.gpu ? button('open-market', `${esc(ui.gpu)} ✕`, `class="pit-tab pit-tab-gpu gpu-${esc(ui.gpu.toLowerCase())}" data-filter="${filter}" aria-label="Show every GPU"`) : ''}</nav><div class="pit-ledger-sheet">${list}</div></div>`,
    footer: `<div class="pit-directory-footer"><div class="pit-pagination">${button('market-page', 'Prev', `class="pit-page-prev" data-step="-1" aria-label="Previous page" ${page === 0 ? 'disabled' : ''}`)}<span aria-label="Page ${page + 1} of ${pages}">Page <b>${page + 1}</b>/${pages}</span>${button('market-page', 'Next', `class="pit-page-next" data-step="1" aria-label="Next page" ${page >= pages - 1 ? 'disabled' : ''}`)}</div></div>` };
}
