// The simplified company floor: one inventory, task requirements, and contextual sourcing.
// Secondary games and financial details have named destinations; every offer remains engine state.
import { figureSVG } from './character.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cents, owned, V7 } from '../tycoon/arcade.js';
import { buyerLive } from '../tycoon/arcade-buyers.js';
import { liveTerm } from '../tycoon/investors.js';
import { companyStats, openCards, cardState } from '../tycoon/founder.js';
import { money as sum, short, pctOf, bpsText } from './pit-ledger.js';
import { companyBoard, assets, tray, gpuTag } from './pit-company.js';
import { workshopQuote, snakeAvailable } from '../tycoon/integration.js';
import { brokerOffer } from './broker-offer.js';
import { baburSays, baburPortrait } from './babur.js';

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
  // HSC design pass: the same cast in 1-bit. Each former colour is now a pattern of the same index (see character.js).
  const P = id => `url(#hsc-f-${id})`;
  return figureSVG({ badge: investor ? 'VC' : role === 'seller' ? 'SUPPLY' : role === 'buyer' ? 'BUYER' : 'HSC', look: {
    skin: ['#F8F7F5', '#E2DCD2', '#B9B1A4', '#8E867A'][i % 4],   // solid tones: no dither on faces (owner, 28 Oct)
    hair: ['#161514', P('p75'), P('hatch'), '#161514'][Math.floor(i / 5) % 4],
    hairStyle: ['slick', 'bob', 'curly', 'short', 'bighair', 'bald'][Math.floor(i / 11) % 6],
    suit: investor ? ['#161514', P('pin'), P('p75')][Math.floor(i / 17) % 3] : role === 'seller' ? [P('check'), P('hound'), P('hatch')][Math.floor(i / 17) % 3] : role === 'buyer' ? [P('p50'), P('chalk'), P('pin')][Math.floor(i / 17) % 3] : '#161514',
    shirt: i % 3 === 1 ? P('shirt') : '#F8F7F5', tie: investor ? P('dots') : [P('stripe'), P('dots'), '#161514'][i % 3], glasses: !!(i % 2), phone: role === 'seller', paddle: paddle || role === 'buyer'
  } });
}

// GPUs some open card still needs: a relevance cue only (never a price ranking).
export function neededGPUs(g) {
  const need = new Set();
  if (g.phase !== 'floor') return need;
  for (const o of openCards(g)) for (const r of cardState(g, o).rows) if (r.held < r.need) need.add(r.gpu);
  return need;
}

function station(g, l, seatName, ctx) {
  const a = g.arcade, t = a.time, price = l.negotiation?.price ?? l.ask, opening = l.ask;
  const vacated = ctx.open && a.active === l.id, cooling = !vacated && l.cooldown > t, rival = ctx.open && l.id === ctx.rivalId;
  const live = !ctx.open && !cooling, worked = price !== opening, favor = l.favor, needed = ctx.need.has(l.gpu);
  const cls = `pit-station seller seat-${seatName} ${needed ? 'is-relevant' : ''} ${vacated ? 'is-vacated' : ''} ${cooling ? 'is-cooling' : ''} ${rival ? 'is-rival' : ''} ${worked ? 'is-worked' : ''} ${favor ? 'is-favor' : ''} ${l.event ? 'is-event' : ''} ${l.block ? 'is-block' : ''} broker-station`;
  const total = cents(l.qty, price), affordable = total <= cash(g);
  const state = vacated ? 'Selected' : cooling ? 'Back shortly' : !affordable ? 'Not enough cash' : '';
  const label = `${l.qty} ${l.gpu}, ${sum(total)} total. ${state || 'Review purchase'}. Supplier ${l.firm}`;
  const inner = brokerOffer(l, total, state);

  return live
    ? `<button type="button" class="${cls}" data-action="focus-supplier" data-id="${esc(l.id)}" data-station-id="${esc(l.id)}" aria-label="${esc(label)}">${inner}</button>`
    : `<div class="${cls}" data-station-id="${esc(l.id)}" ${ctx.open ? 'aria-hidden="true"' : `role="group" aria-label="${esc(label)}"`}>${inner}</div>`;
}

function hud(g, ui, open) {
  const s = companyStats(g), clock = Math.max(0,Math.ceil(V7.seconds-g.arcade.time));
  return `<header class="pit-hud simplified-hud"><div class="hud-co"><button class="pit-help" data-action="help" aria-label="Help from Babur" title="Help from Babur" ${activeLot(g)?.negotiation.running?'disabled':''}>?</button><span class="hud-name"><b title="${esc(s.name)}">${esc(s.name)}</b></span></div><div class="hud-cash"><span>Cash</span><strong data-fx-cash>${money(cash(g))}</strong></div><div class="hud-val" title="Estimated paper stake, not final payout"><span>Your stake · est.</span><strong data-paper-stake="${s.founderValue}">${short(s.founderValue)}</strong><small>${pctOf(s.founderPct)} owned</small></div><div class="hud-round" aria-label="Round ${g.q} of ${V7.rounds}"><span>Round</span><strong>${g.q}<small>/${V7.rounds}</small></strong></div><div class="pit-clock ${open?'is-paused':''}"><span>${g.phase!=='floor'?'Closed':open?'Paused':'Remaining'}</span><strong data-floor-clock>${g.phase!=='floor'?'—':`${clock}s`}</strong></div></header>`;
}

function workshopButtons(g, live) {
  if (g.phase !== 'floor') return '';
  return `<div class="pit-workshops" role="group" aria-label="Free minigames">${['node', 'cable'].map(kind => {
    const q = workshopQuote(g, kind), name = kind === 'node' ? 'Node Tetris' : 'Cable Mania';
    const inner = `<b>${name}</b><small>${q.remaining > 0 ? `Best prize · ${sum(q.remaining)} left` : 'Free practice'}</small>`;
    return control(live, 'workshop', 'workshop-button', inner, `data-kind="${kind}" aria-label="Play ${name} for free. ${q.remaining > 0 ? `Up to ${sum(q.remaining)} more performance prize this round.` : 'Round prize already earned; unlimited free practice.'}"`);
  }).join('')}</div>`;
}

export function stage(g, ui = {}) {
  const live = !ui.focusOpen, a = g.arcade, need = [...neededGPUs(g)];
  const term = g.phase==='floor' ? liveTerm(g) : null;
  return `<section class="pit-stage simplified-stage ${live?'':'is-backdrop'}" aria-label="Your company"><div>${hud(g,ui,!live)}</div><div class="pit-main simplified-main"><div class="company-workspace"><section class="compact-inventory"><h2>Your GPUs</h2>${tray(g,live)}<p>Free GPUs can fill a task. Unbuilt stock expires at the bell.</p></section><div class="pit-hintbar"></div><section class="sourcing-entry"><h2>Build your business</h2><p>Start with a task on the right. Its empty GPU tiles open matching broker offers.</p>${need.length ? `<div class="sourcing-types">${need.slice(0,2).map(gpu=>control(live,'open-market','source-needed',`Find ${esc(gpu)} →`,`data-filter="supply" data-gpu="${esc(gpu)}" data-context="1" data-need="1"`)).join('')}</div>` : '<p>Your current tasks have their GPU stock. Allocate it on a task, or inspect another offer.</p>'}${control(live,'open-market','all-offers-link','All offers →','data-filter="all" data-context="all"')}</section>${term ? `<section class="context-funding"><b>Funding offer available</b>${control(live,'review-term','funding-entry',`Review ${esc(term.name)} →`,`data-id="${esc(term.id)}"`)}</section>` : ''}<div class="workspace-secondary">${control(live,'open-minigames','secondary-entry','Minigames')}${control(live,'open-details','secondary-entry','Company details')}</div></div><aside class="pit-board">${companyBoard(g,ui,live)}</aside></div></section>`;
}

// Secondary information has a named destination, rather than a second permanent toolbar.
export function utilityView(g, ui = {}) {
  if (ui.panel === 'minigames') {
    const kernel = snakeAvailable(g);
    return { title:'Minigames',role:'minigames',desk:'paper',exit:null,body:`<div class="utility-sheet"><p>Play for free in every round. Prizes improve only when you beat your best result for that game this round.</p>${workshopButtons(g,true)}${kernel ? control(true,'workshop','workshop-button','<b>Cluster Snake</b><small>Earned cluster unlock · free play</small>','data-kind="kernel"') : '<details><summary>Cluster Snake unlock</summary><p>Reach a 48-GPU deployment at the bell to unlock Cluster Snake. A live fleet or a new integration batch qualifies.</p></details>'}</div>`,footer:button('close-focus','Back to company','class="mat-exit rail-quiet"') };
  }
  if (ui.panel !== 'details') return null;
  const st = companyStats(g), terms = g.arcade.terms.filter(t=>t.status==='open' && t.at<=g.arcade.time && t.until>g.arcade.time);
  return { title:'Company details',role:'details',desk:'paper',exit:null,body:`<div class="utility-sheet"><dl class="company-financials"><div><dt>Revenue / round</dt><dd>${sum(st.revenue)}</dd></div><div><dt>Burn / round</dt><dd>${sum(st.burn)}</dd></div><div><dt>Cash runway</dt><dd>${st.runway===Infinity?'Profitable':`${st.runway} rounds`}</dd></div><div><dt>Model</dt><dd>${esc(st.model)}</dd></div></dl>${assets(g)}<h3>Funding</h3>${terms.length?terms.map(t=>button('review-term',`Review ${esc(t.name)} · ${sum(t.amount)} for ${bpsText(t.pct)}`,`class="detail-action" data-id="${esc(t.id)}"`)).join(''):'<p>No live term sheets.</p>'}<h3>Market</h3>${button('open-market','Resale: inspect bids for spare GPUs','class="detail-action" data-filter="buyers" data-context="all"')}${button('open-market','All offers & full market ledger','class="detail-action" data-filter="all" data-context="all"')}${button('sound',ui.sound?'Sound on · turn off':'Sound off · turn on',`class="detail-action" aria-pressed="${!!ui.sound}"`)}</div>`,footer:button('close-focus','Back to company','class="mat-exit rail-quiet"') };
}

// The desk frame: no modal over a blurred room. A dock below the never-dimmed HUD holds a
// band (the counterparty at the far edge of your desk), the desk instrument and the rail.
export function focusFrame(g, view) {
  const identity = g.arcade.practice ? null : view.identity, identityRole = identity?.role || view.role || 'capital';
  const role = ['seller', 'buyer', 'startup', 'capital', 'investor'].includes(identityRole) ? identityRole : 'capital';
  const desk = view.desk || (identity ? 'deal' : 'paper');
  const exit = view.exit === null || g.phase !== 'floor' ? null : view.exit || { action: 'close-focus', label: 'Floor' };
  const roleName = identity?.tag ? identity.tag : role === 'seller' ? 'SUPPLIER' : role === 'buyer' ? 'RESALE BUYER' : role === 'investor' ? 'INVESTOR' : role === 'startup' ? 'FOUNDER' : 'CAPITAL';
  return `<div class="pit-focus-scrim ${identity ? 'has-band' : 'is-paper'}"><section class="pit-focus ${identity ? 'has-identity' : 'is-paper'} tone-${esc(view.tone || 'plain')} focus-${esc(view.role || 'deal')} desk-${esc(desk)}" data-desk="${esc(desk)}" role="dialog" aria-modal="true" aria-labelledby="focus-title" tabindex="-1">
    <header class="pit-focus-heading">${exit ? button(exit.action, `<span class="exit-arrow" aria-hidden="true"></span><span class="exit-label">${esc(exit.label)}</span>`, `class="pit-focus-close mat-exit" aria-label="${esc(exit.aria || exit.label)}"`) : ''}<h2 id="focus-title">${esc(view.title)}</h2></header>
    ${identity ? `<aside class="pit-counterparty ${role}" data-mood="${esc(identity.mood || 'neutral')}"><div class="pit-bust" data-fx-figure aria-hidden="true">${identity.name === 'Babur Training Supply' ? baburPortrait() : person(role, identity.name)}</div><div class="pit-bubble" data-fx-bubble>${identity.reaction ? `<strong class="pit-reaction">${esc(identity.reaction)}</strong>` : ''}${identity.line ? `<blockquote>“${esc(identity.line)}”</blockquote>` : ''}</div><div class="pit-nameplate"><span class="pit-counterparty-role">${roleName}</span><h3>${esc(identity.name)}</h3>${identity.subtitle ? `<p>${esc(identity.subtitle)}</p>` : ''}</div></aside>` : ''}
    <div class="pit-focus-body" data-desk="${esc(desk)}">${view.guidance ? baburSays(view.guidance,{small:true,expression:view.baburExpression || 'explaining'}) : ''}${view.body || ''}</div>
    <footer class="pit-focus-footer">${view.footer || ''}</footer>
  </section></div>`;
}

// Page size follows the composition: two ledger columns of four on a desk, four rows on a phone.
const compact = () => { try { return matchMedia('(max-width: 768px)').matches; } catch { return false; } };

// Compare only arrived, visible supply against an open card's unmet recipe after free stock.
export function supplierCoverage(g, lot, cardId = null) {
  const cards = cardId ? openCards(g).filter(c => c.id === cardId) : openCards(g);
  return cards.map(card => {
    const row = cardState(g, card).rows.find(r => r.gpu === lot.gpu);
    const need = row ? Math.max(0, row.need - row.held - row.free) : 0;
    return { card, need, cover: Math.min(lot.qty, need) };
  }).filter(x => x.cover > 0).sort((a,b) => b.cover - a.cover || b.need - a.need)[0] || null;
}

// The market ledger: every live lot and resale bid, optionally one GPU type.
export function directoryView(g, ui = {}) {
  if (ui.marketContext && ui.gpu) {
    const card = openCards(g).find(c=>c.id===ui.marketCardId), row = card && cardState(g,card).rows.find(r=>r.gpu===ui.gpu);
    const qty = row ? Math.max(1,row.need-row.held-row.free) : Math.max(1,Number(ui.marketNeed)||1);
    const lots = g.arcade.lots.filter(l=>available(g,l)&&l.gpu===ui.gpu).slice(0,2);
    const future = g.arcade.lots.filter(l=>l.gpu===ui.gpu&&l.at>g.arcade.time).sort((a,b)=>a.at-b.at)[0];
    return { title:`Find ${qty} ${ui.gpu}`,role:'market',desk:'ledger',exit:null,body:`<section class="context-market">${card?`<p>For ${esc(card.name)}</p>`:''}<p>Choose a quote to review. Nothing is purchased until you sign.</p><div class="context-offers">${lots.map(l=>station(g,l,'context',{open:false,need:new Set([ui.gpu])})).join('') || `<div class="context-empty"><h3>No ${esc(ui.gpu)} offers right now</h3><p>${future?`More ${esc(ui.gpu)} supply arrives in about ${Math.ceil(future.at-g.arcade.time)} floor seconds. Return to your company to let arrivals continue.`:'No more matching supply is scheduled this round. Inspect other offers or work on another task.'}</p></div>`}</div></section>`,footer:button('close-focus','Back to task','class="mat-exit rail-quiet"')+button('open-market','All offers →','class="mat-exit" data-filter="all" data-context="all"') };
  }
  const a = g.arcade, filter = ['supply', 'buyers'].includes(ui.marketFilter) ? ui.marketFilter : 'all', need = neededGPUs(g);
  const project = openCards(g).find(c => c.id === ui.marketCardId);
  const coverage = lot => supplierCoverage(g, lot, project?.id);
  const only = list => ui.gpu ? list.filter(({ item }) => item.gpu === ui.gpu) : list;
  const lots = a.lots.filter(l => available(g, l)), bids = a.buyers.filter(b => buyerLive(g, b));
  const suppliers = only(lots.map(item => ({ item, role: 'seller' }))).sort((x,y) => (coverage(y.item)?.cover || 0) - (coverage(x.item)?.cover || 0) || y.item.qty - x.item.qty), buyers = only(bids.map(item => ({ item, role: 'buyer' })));
  const row = ({ item, role }) => {
    const seller = role === 'seller', name = seller ? item.firm : item.name, qty = seller ? item.qty : buyerQty(item), price = seller ? item.negotiation?.price ?? item.ask : item.rate;
    const opening = seller ? item.ask : item.openingRate ?? item.rate, free = seller ? 0 : owned(g, item.gpu);
    const fit = seller ? coverage(item) : null;
    const tag = seller ? item.favor ? `HELD FOR YOU · TRUST ${g.firms[item.firm]?.trust ?? 0}` : need.has(item.gpu) ? 'SUPPLIER · NEEDED' : 'SUPPLIER' : `RESALE BID · ${free} FREE`;
    const fitText = fit ? `Covers ${fit.cover}/${fit.need} for ${fit.card.name}` : '';
    if (seller) return `<button type="button" class="pit-market-row seller broker-row" data-action="focus-supplier" data-id="${esc(item.id)}" aria-label="Review ${qty} ${esc(item.gpu)} for ${sum(cents(qty, price))} total from ${esc(name)}">${brokerOffer(item, cents(qty, price), cents(qty, price) > cash(g) ? 'Not enough cash' : '')}</button>`;
    return `<button type="button" class="pit-market-row ${role} gpu-${item.gpu.toLowerCase()} ${seller && fit ? 'is-relevant' : ''} ${item.favor ? 'is-favor' : ''}" data-action="${seller ? 'focus-supplier' : 'focus-buyer'}" data-id="${esc(item.id)}" aria-label="${seller ? 'Supplier' : 'Resale bid'} ${esc(name)}: ${qty} ${esc(item.gpu)} at ${rate(price)} per GPU-hour, ${sum(cents(qty, price))} ${seller ? 'lot' : `funded; you hold ${free} free`}${fit ? `; ${esc(fitText)}` : ''}, ${Math.ceil(Math.max(0, item.until - a.time))} seconds left"><span class="pit-market-face" aria-hidden="true">${person(role, name)}</span><span class="pit-market-who"><small class="pit-market-role">${tag}</small><b>${esc(name)}</b></span><strong class="pit-market-rate">${price !== opening ? `<s>${rate(opening)}</s>` : ''}${rate(price)}<small>/h</small></strong><span class="pit-market-lot"><span>${qty} ${gpu(item.gpu)}</span><span class="pit-dot">${sum(cents(qty, price))}</span>${fit ? `<small class="pit-market-cover">${esc(fitText)}</small>` : ''}</span>${fuse(item.until, item.at, a.time)}</button>`;
  };
  const split = !compact() && filter === 'all', size = split ? 4 : compact() ? 4 : 8;
  const entries = filter === 'supply' ? suppliers : filter === 'buyers' ? buyers : Array.from({ length: Math.max(suppliers.length, buyers.length) }, (_, i) => [suppliers[i], buyers[i]]).flat().filter(Boolean);
  const pages = Math.max(1, split ? Math.ceil(Math.max(suppliers.length, buyers.length) / size) : Math.ceil(entries.length / size)), page = Math.max(0, Math.min(pages - 1, Number(ui.page) || 0));
  const cut = list => list.slice(page * size, page * size + size);
  const scheduled = (filter === 'buyers' ? a.buyers : filter === 'supply' ? a.lots : [...a.lots, ...a.buyers]).some(item => item.at > a.time);
  const empty = `<p class="pit-market-empty">${filter === 'buyers' ? 'No resale bids in this view.' : 'No live quotes in this view.'} ${scheduled ? 'More offers are scheduled. Return to the floor to advance time; this directory pauses arrivals.' : 'No more scheduled arrivals. Try another view or GPU.'}</p>`;
  const list = !entries.length ? `<div class="pit-market-list">${empty}</div>`
    : split ? `<div class="pit-market-list is-split"><div class="pit-market-col seller"><h3>Suppliers</h3>${cut(suppliers).map(row).join('')}</div><div class="pit-market-col buyer"><h3>Resale bids</h3>${cut(buyers).map(row).join('') || '<p class="pit-market-empty">None live</p>'}</div></div>`
    : `<div class="pit-market-list">${cut(entries).map(row).join('')}</div>`;
  const filters = [['all', 'All', lots.length + bids.length], ['supply', 'Suppliers', lots.length], ['buyers', 'Resale', bids.length]];
  const title = filter === 'buyers' ? (ui.gpu ? `${ui.gpu} resale bids` : 'Resale desk') : ui.gpu ? `${ui.gpu} on the floor` : 'Market ledger';
  return { title, role: 'market', desk: 'ledger',
    body: `<div class="pit-directory"><nav class="pit-market-filters" aria-label="Market view">${filters.map(([key, label, n]) => button('open-market', `${label} <b>${n}</b>`, `class="pit-tab" data-filter="${key}" ${ui.gpu ? `data-gpu="${esc(ui.gpu)}"` : ''} aria-pressed="${filter === key}"`)).join('')}${ui.gpu ? button('open-market', `${esc(ui.gpu)} ✕`, `class="pit-tab pit-tab-gpu gpu-${esc(ui.gpu.toLowerCase())}" data-filter="${filter}" aria-label="Show every GPU"`) : ''}</nav>${project ? `<p class="pit-market-context">Comparing lots for <b>${esc(project.name)}</b></p>` : ''}<div class="pit-ledger-sheet">${list}</div></div>`,
    footer: `<div class="pit-directory-footer"><div class="pit-pagination">${button('market-page', 'Prev', `class="pit-page-prev" data-step="-1" aria-label="Previous page" ${page === 0 ? 'disabled' : ''}`)}<span aria-label="Page ${page + 1} of ${pages}">Page <b>${page + 1}</b>/${pages}</span>${button('market-page', 'Next', `class="pit-page-next" data-step="1" aria-label="Next page" ${page >= pages - 1 ? 'disabled' : ''}`)}</div></div>` };
}
