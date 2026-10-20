// The trading pit is a view of actual engine counterparties. Presentation choices
// never reserve capacity, sort by margin, or change the finite market.
import { figureSVG } from './character.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cents, fortune, inventoryCost, owned, remaining, V7 } from '../tycoon/arcade.js';
import { buyerLive } from '../tycoon/arcade-buyers.js';
import { vcLive } from '../tycoon/arcade-vc.js';
import { rivalQuotes } from '../tycoon/arcade-negotiation.js';
import { phaseName, stageName, liveCompanies, orderOf, paperOf, stakePct, short, earlyState, whaleFacts, money as cash$ } from './pit-ledger.js';

// HUD cash always shows cents (pit-fx rolls it in that format); desks drop a zero cents part.
const money = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(c / 100);
const sum = c => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: Math.abs(c) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const whole = c => `$${Math.round(c / 100).toLocaleString('en-US')}`;
const faceOf = name => [...String(name || 'HSC')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
const rate = n => `$${(n / 100).toFixed(2)}`;
const gpu = name => `<span class="pit-gpu pit-gpu-${esc(name.toLowerCase())}">${esc(name)}</span>`;
const button = (action, text, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${text}</button>`;
// While a desk is open the room is an inert backdrop: it keeps its look but carries no
// duplicate data-action controls that could shadow the desk's own buttons.
const control = (live, action, cls, inner, attrs = '') => live ? `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${inner}</button>` : `<span class="${cls}">${inner}</span>`;
const buyerQty = b => Math.max(0, Math.min(b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A fuse is the real time window: the controller rewrites its text and --left every 250ms.
function fuse(until, at, now, cls = '') {
  const left = Math.max(0, until - now), span = Math.max(1, until - at);
  return `<span class="pit-fuse ${cls} ${left < 8 ? 'is-short' : ''}" data-fuse style="--left:${Math.min(1, left / span).toFixed(3)}"><b data-station-until="${until}" data-station-at="${at}">${Math.ceil(left)}s</b></span>`;
}

export function person(role, name, { paddle = false } = {}) {
  const i = faceOf(name), founder = role === 'startup';
  return figureSVG({ badge: founder ? 'FOUNDER' : role === 'seller' ? 'SUPPLY' : role === 'buyer' ? 'BUYER' : 'HSC', look: {
    skin: ['#DDA67C', '#BC8059', '#875038', '#E9BA96'][i % 4],
    hair: ['#30241C', '#5B372A', '#B0A393', '#171C21'][Math.floor(i / 5) % 4],
    hairStyle: ['slick', 'bob', 'curly', 'short', 'bighair', 'bald'][Math.floor(i / 11) % 6],
    suit: founder ? '#B77543' : role === 'seller' ? ['#486957', '#3C625F', '#67714D'][Math.floor(i / 17) % 3] : role === 'buyer' ? ['#6D4E68', '#765344', '#4C5A73'][Math.floor(i / 17) % 3] : '#465B70',
    shirt: '#F4EBD6', tie: ['#B6472C', '#C7A44E', '#284C58'][i % 3], glasses: !!(i % 2), phone: role === 'seller', paddle: paddle || role === 'buyer'
  } });
}

function market(g, ui = {}) {
  const a = g.arcade, t = a.time;
  const lots = a.lots.filter(l => available(g, l));
  const buyers = a.buyers.filter(b => buyerLive(g, b));
  // The whale has its own seat on the floor; it is never lit or seated for you automatically.
  const regular = buyers.filter(b => !b.whale), whale = buyers.find(b => b.whale) || null;
  const remembered = regular.find(b => b.id === g.arcade.sourcingFor?.buyerId || b.id === g.arcade.sourcingFor || b.id === ui.buyerId);
  // Engine order is deliberate. This cue reveals relevance, never the best spread.
  const primaryBuyer = regular.find(b => owned(g, b.gpu) > 0) || remembered || regular[0];
  const relevantGPU = ui.gpu || primaryBuyer?.gpu;
  // Booths seat open lots inside their window, including one cooling after you stepped
  // away, so a desk does not vanish or hop the moment you leave it.
  const seatable = a.lots.filter(l => g.phase === 'floor' && l.status === 'open' && l.at <= t && l.until > t);
  // A held block (earned Trust) takes the first booth for its GPU: the relationship paying off.
  const firstSupplier = seatable.find(l => l.gpu === relevantGPU && l.favor) || seatable.find(l => l.gpu === relevantGPU) || seatable.find(l => l.favor) || seatable[0];
  const pick = (items, first) => first ? [first, ...items.filter(x => x !== first)].slice(0, 2) : [];
  const suppliers = pick(seatable, firstSupplier), customers = pick(regular, primaryBuyer);
  // The counterparty at your desk keeps a (vacated) booth in the room behind the deal.
  const seat = (list, item) => { if (item && !list.includes(item)) { list.unshift(item); list.length = Math.min(2, list.length); } };
  seat(suppliers, activeLot(g));
  seat(customers, regular.find(b => b.id === a.confirm?.buyerId));
  return { lots, buyers, primaryBuyer, relevantGPU, suppliers, customers, whale };
}

function station(g, item, role, seatName, ctx) {
  const a = g.arcade, t = a.time, seller = role === 'seller', name = seller ? item.firm : item.name;
  const qty = seller ? item.qty : buyerQty(item), price = seller ? item.negotiation?.price ?? item.ask : item.rate;
  const opening = seller ? item.ask : item.openingRate ?? item.rate;
  const primary = item.id === ctx.primaryId, relevant = !primary && item.gpu === ctx.relevantGPU;
  const vacated = ctx.open && (seller ? a.active === item.id : a.confirm?.buyerId === item.id);
  const cooling = seller && !vacated && item.cooldown > t;
  const rival = ctx.open && item.id === ctx.rivalId;
  const live = !ctx.open && !cooling;
  const worked = price !== opening;
  const favor = seller && item.favor;
  const cls = `pit-station ${role} seat-${seatName} ${primary ? 'is-primary' : relevant ? 'is-relevant' : ''} ${vacated ? 'is-vacated' : ''} ${cooling ? 'is-cooling' : ''} ${rival ? 'is-rival' : ''} ${worked ? 'is-worked' : ''} ${favor ? 'is-favor' : ''}`;
  const screen = vacated
    ? `<span class="pit-crt-away">AT YOUR DESK</span>`
    : cooling
      ? `<span class="pit-crt-head">${qty} ${gpu(item.gpu)}</span><span class="pit-crt-away">BACK IN</span>${fuse(item.cooldown, item.cooldown - 5, t, 'is-cooldown')}`
      : `<span class="pit-crt-head">${qty} ${gpu(item.gpu)}<i aria-hidden="true"></i></span><span class="pit-crt-rate">${worked ? `<s>${rate(opening)}</s>` : ''}<b>${rate(price)}</b><small>/h</small></span><span class="pit-crt-total">${sum(cents(qty, price))} ${seller ? 'lot' : 'funded'}</span>${fuse(item.until, item.at, t)}`;
  const label = `${favor ? `Held for you by ${name} (Trust ${g.firms[name]?.trust ?? 0}): ` : ''}${seller ? 'Supplier' : 'Buyer'} ${name}: ${qty} ${item.gpu} at ${rate(price)} per GPU-hour, ${sum(cents(qty, price))} ${seller ? 'lot' : 'funded'}${cooling ? `, back in ${Math.ceil(item.cooldown - t)} seconds` : `, ${Math.ceil(Math.max(0, item.until - t))} seconds left`}`;
  const inner = `${primary && !vacated ? '<span class="pit-station-lamp" aria-hidden="true"></span>' : ''}<span class="pit-station-person" aria-hidden="true">${vacated ? '' : person(role, name)}</span><span class="pit-crt">${screen}</span><span class="pit-station-plaque"><b>${esc(name)}</b><small>${favor ? 'HELD FOR YOU' : seller ? 'SUPPLIER' : 'BUYER'}</small></span>`;
  return live
    ? `<button type="button" class="${cls}" data-action="${seller ? 'focus-supplier' : 'focus-buyer'}" data-id="${esc(item.id)}" data-station-id="${esc(item.id)}" aria-label="${esc(label)}">${inner}</button>`
    : `<div class="${cls}" data-station-id="${esc(item.id)}" ${ctx.open ? 'aria-hidden="true"' : `role="group" aria-label="${esc(label)}"`}>${inner}</div>`;
}

const emptyBooth = (role, seatName) => `<div class="pit-station ${role} seat-${seatName} is-empty" aria-hidden="true"><span class="pit-station-person"></span><span class="pit-crt"><span class="pit-crt-away">NO QUOTE</span></span><span class="pit-station-plaque"><b>Open booth</b><small>${role === 'seller' ? 'SUPPLIER' : 'BUYER'}</small></span></div>`;

// Founders' boxes: every live company with its stage, your stake and this round's need.
// Each opens its own company desk (the anchor through focus-anchor, the rest through focus-order).
function founders(g, ui, open) {
  const a = g.arcade, t = a.time, companies = liveCompanies(g);
  if (!companies.length) return '';
  const deskOrder = a.confirm?.orderId || (ui.panel === 'startup' ? ui.orderId || a.orders.find(o => o.client === a.anchor)?.id : null);
  const deskClient = a.orders.find(o => o.id === deskOrder)?.client;
  const cards = companies.map(s => {
    const o = orderOf(g, s), left = o ? remaining(o) : 0, e = earlyState(g, o), vc = a.vcOffers.some(v => v.client === s.id && vcLive(g, v));
    const away = open && deskClient === s.id, stock = o && left && owned(g, o.gpu);
    const stake = s.stake > 0 ? `<b class="pit-seat-stake">YOU ${stakePct(s.stake)}</b>` : '<span class="pit-seat-stake is-none">NO STAKE</span>';
    const need = !o ? '<span>No order</span>' : left ? `<span class="pit-seat-qty">${left} ${gpu(o.gpu)}</span>` : '<span class="pit-seat-qty is-done">FILLED</span>';
    const early = !o || g.phase !== 'floor' ? '' : e.kind === 'met' ? '<i class="pit-seat-flag is-met">EARLY</i>' : e.kind === 'open' && left ? fuse(e.at, 0, t, 'is-early') : '';
    const label = `${s.name}, ${stageName(s)} stage, valued ${short(Math.round(s.val * 100))}. ${s.stake > 0 ? `You own ${stakePct(s.stake)}, ${cash$(paperOf(s))} on paper` : 'No stake'}. ${o ? left ? `Needs ${left} ${o.gpu} this round${e.kind === 'open' ? `, early by second ${e.at}` : ''}` : 'Order filled' : ''}${vc ? '. A VC bid is open' : ''}. Open the company desk.`;
    const inner = `${away ? '<span class="pit-seat-away">AT YOUR DESK</span>' : ''}<span class="pit-seat-person" aria-hidden="true">${person('startup', s.name)}</span><span class="pit-seat-copy"><b class="pit-seat-name">${esc(s.name)}</b><span class="pit-seat-meta"><span class="pit-seat-stage">${stageName(s).toUpperCase()}</span><span class="pit-seat-val">${short(Math.round(s.val * 100))}</span>${stake}</span><span class="pit-seat-need">${need}${early}</span></span>${vc ? '<i class="pit-seat-flag is-vc">VC BID</i>' : ''}`;
    const cls = `pit-seat stage-${Math.floor(s.v104.stage)} ${s.id === a.anchor ? 'is-anchor' : ''} ${stock ? 'has-stock' : ''} ${vc ? 'has-vc' : ''} ${away ? 'is-vacated' : ''}`;
    if (open || !o) return `<div class="${cls}" ${open ? 'aria-hidden="true"' : `role="group" aria-label="${esc(label)}"`}>${inner}</div>`;
    return s.id === a.anchor
      ? `<button type="button" class="${cls}" data-action="focus-anchor" data-id="${esc(o.id)}" aria-label="${esc(label)}">${inner}</button>`
      : `<button type="button" class="${cls}" data-action="focus-order" data-id="${esc(o.id)}" aria-label="${esc(label)}">${inner}</button>`;
  }).join('');
  return `<div class="pit-founders count-${companies.length}" role="group" aria-label="Companies on the floor">${cards}</div>`;
}

// The whale: one huge, funded, final bid. Its own seat, unmissable, never auto-selected.
function whaleSeat(g, w, open) {
  if (!w) return '';
  const f = whaleFacts(g, w), t = g.arcade.time, away = open && g.arcade.confirm?.buyerId === w.id;
  const label = `The whale, ${w.name}: wants ${f.left} ${w.gpu} at ${rate(w.rate)} per GPU-hour, ${f.premium} times the market bid. ${cash$(f.bonus)} bonus paid on the sale that completes the order. ${Math.ceil(Math.max(0, w.until - t))} seconds left. Final bid.`;
  const inner = `<span class="pit-whale-tag">THE WHALE</span><span class="pit-whale-person" aria-hidden="true">${away ? '' : person('buyer', w.name, { paddle: true })}</span><span class="pit-whale-crt">${away ? '<span class="pit-crt-away">AT YOUR DESK</span>' : `<span class="pit-whale-want"><b>${f.left}</b> ${gpu(w.gpu)} <small class="pit-whale-long">${f.filled ? `${f.filled}/${f.qty} filled` : 'wanted'}</small></span><span class="pit-whale-rate"><b>${rate(w.rate)}</b><small>/h · ${f.premium}×<span class="pit-whale-long"> mkt</span></small></span><span class="pit-whale-bonus">+${cash$(f.bonus)} <small>bonus</small></span>${fuse(w.until, w.at, t, 'is-whale')}`}</span><span class="pit-whale-name"><b>${esc(w.name)}</b></span>`;
  return open ? `<div class="pit-whale ${away ? 'is-vacated' : ''}" data-station-id="${esc(w.id)}" aria-hidden="true">${inner}</div>`
    : `<button type="button" class="pit-whale" data-action="focus-buyer" data-id="${esc(w.id)}" data-station-id="${esc(w.id)}" aria-label="${esc(label)}">${inner}</button>`;
}

// One honest line per fill this round, from the receipt the engine recorded.
function fill(r) {
  const gain = ['buyer', 'mandate'].includes(r.kind) || (r.kind === 'startup' && r.payment === 'cash') ? r.total - r.cost : null;
  const what = r.kind === 'secondary' ? 'shares' : `${r.qty} ${esc(r.gpu)}`;
  const verb = { purchase: 'BOUGHT', buyer: 'SOLD', mandate: 'ATLAS', startup: r.payment === 'equity' ? 'EQUITY' : 'DELIVERED', secondary: 'SOLD' }[r.kind] || 'FILLED';
  const tail = gain !== null ? `<em>${gain < 0 ? '−' : '+'}${sum(Math.abs(gain))}</em>` : r.kind === 'secondary' ? `<em>${sum(r.total)}</em>` : '';
  return `<li class="${gain === null ? '' : gain < 0 ? 'is-loss' : 'is-gain'}"><b>${verb}</b> ${what}${tail ? ` ${tail}` : ''} <span>· ${esc(r.counterparty)}</span></li>`;
}

export function stage(g, ui = {}) {
  const a = g.arcade, m = market(g, ui), open = !!ui.focusOpen, live = !open;
  const vc = a.vcOffers.find(v => vcLive(g, v));
  const upcoming = [...a.lots, ...a.buyers].filter(x => x.at > a.time).sort((x, y) => x.at - y.at)[0];
  const lastArrival = Math.max(0, ...[...a.lots, ...a.buyers].filter(x => x.at <= a.time).map(x => x.at));
  const primary = m.primaryBuyer, primaryQty = primary && buyerQty(primary);
  const badNotice = a.message?.tone === 'bad' && !a.active && !a.confirm ? a.message.text : null;
  const cue = primary ? owned(g, primary.gpu) ? `${owned(g, primary.gpu)} ${primary.gpu} in your book. Find your sale.` : `${primary.name} needs ${primaryQty} ${primary.gpu}. Work the room.` : m.lots.length ? 'Supply is on the floor. Find your next deal.' : upcoming ? `New quotes arrive in ${Math.ceil(upcoming.at - a.time)} seconds.` : 'The market is quiet. Review your book or close the round.';
  const memo = ui.memo ? `${ui.memo.firm}: ${ui.memo.text || (ui.memo.outcome === 'expired' ? 'The quote expired.' : 'The desk closed.')}` : badNotice;
  const worth = fortune(g).netWorth, money$ = cash(g), clock = Math.max(0, Math.ceil(V7.seconds - a.time)), phase = phaseName(g.q);
  const l = activeLot(g), rivalId = open && l?.status === 'open' ? rivalQuotes(g)[0]?.id : null;
  const ctx = { open, primaryId: primary?.id, relevantGPU: m.relevantGPU, rivalId };
  const seats = [['seller', 's0', m.suppliers[0]], ['seller', 's1', m.suppliers[1]], ['buyer', 'b0', m.customers[0]], ['buyer', 'b1', m.customers[1]]];
  const booths = seats.map(([role, name, item]) => item ? station(g, item, role, name, ctx) : emptyBooth(role, name)).join('');
  const stock = a.inventory.filter(x => x.left > 0), held = stock.reduce((n, x) => n + x.left, 0);
  const chips = ['H100', 'H200', 'B200'].map(k => [k, stock.filter(x => x.gpu === k).reduce((n, x) => n + x.left, 0)]).filter(([, n]) => n);
  const fills = a.receipts.filter(r => r.q === g.q).slice(-2).reverse();
  const liveCount = m.lots.length + m.buyers.length;
  return `<section class="pit-stage ${open ? 'is-backdrop' : ''} ${m.whale ? 'has-whale' : ''}" aria-label="Haight Street Compute trading floor">
    <header class="pit-hud ${money$ >= 10000000 ? 'has-large-cash' : ''} ${open ? 'is-paused' : ''}">
      <div class="pit-hud-brand"><b>HSC</b><span>THE TRADING PIT</span></div>
      <div class="pit-cash"><span>CASH</span><strong data-fx-cash>${money(money$)}</strong></div>
      ${control(live, 'open-panel', 'pit-worth', `<span>IF<i> THE</i> BELL RANG</span><strong data-fx-worth>${whole(worth)}</strong>`, `data-panel="fortune" aria-label="If the bell rang now: ${whole(worth)}. Cash, stock at cost and live stakes at the closing desk's 30%. Open the breakdown"`)}
      <div class="pit-round" aria-label="Round ${g.q} of ${V7.rounds}: ${esc(phase)}"><span>ROUND<em> · ${esc(phase.toUpperCase())}</em></span><strong>${g.q}<small>/${V7.rounds}</small></strong></div>
      ${g.phase !== 'floor' ? '<div class="pit-clock is-paused is-closed" title="The bell has rung for this round"><span>FLOOR</span><strong>CLOSED</strong></div>' : `<div class="pit-clock ${open ? 'is-paused' : ''}" ${open ? 'title="Floor paused · reading is free"' : ''}><span>${open ? 'PAUSED' : 'FLOOR'}</span><strong data-floor-clock>${clock}s</strong></div>`}
      ${button('sound', `<span class="pit-sound-icon" aria-hidden="true">${ui.sound ? '♫' : '♪'}</span><span class="pit-sound-text" aria-hidden="true">${ui.sound ? 'Sound on' : 'Sound off'}</span>`, `class="pit-sound ${ui.sound ? 'is-on' : ''}" aria-label="Sound ${ui.sound ? 'on; turn off' : 'off; turn on'}" aria-pressed="${!!ui.sound}"`)}
    </header>
    <div class="pit-hall">
      <div class="pit-architecture" aria-hidden="true"><div class="pit-coffer"></div><div class="pit-column column-left"></div><div class="pit-column column-right"></div><div class="pit-marble"></div><div class="pit-balustrade"></div></div>
      <div class="pit-cornice">${g.phase !== 'floor' ? '<span>THE BELL HAS RUNG</span><i>·</i><span>BOOKS CLOSED</span>' : open ? '<span>FLOOR PAUSED</span><i>·</i><span>READING IS FREE</span>' : `<span>ROUND ${g.q} OF ${V7.rounds}</span><i>·</i><span>${esc(phase.toUpperCase())}</span>`}</div>
      <div class="pit-tape" role="group" aria-label="The tape">
        ${open ? '<span class="pit-tape-paused">FLOOR PAUSED · READING IS FREE</span>' : ''}<span class="pit-tape-title">THE TAPE</span><span class="pit-tape-phase">R${g.q} · ${esc(phase.toUpperCase())}</span>
        <span class="pit-tape-count"><b>${m.lots.length}</b> ${m.lots.length === 1 ? 'supplier' : 'suppliers'} <i>·</i> <b>${m.buyers.length}</b> ${m.buyers.length === 1 ? 'buyer' : 'buyers'}</span>
        ${upcoming && g.phase === 'floor' ? `<span class="pit-tape-next">next<span class="pit-tape-long"> desk in</span> ${fuse(upcoming.at, lastArrival, a.time, 'is-next')}</span>` : `<span class="pit-tape-next">no more arrivals</span>`}
        ${fills.length ? `<ol class="pit-tape-fills">${fills.map(fill).join('')}</ol>` : ''}
      </div>
      <div class="pit-doors ${a.mandate || a.mandateCompleted ? 'has-two' : ''}">${control(live, 'open-panel', `pit-office ${vc ? 'has-bid' : ''}`, `<span>CAPITAL OFFICE</span><b>${vc ? 'VC bid open' : 'No bids'}</b>`, 'data-panel="capital" aria-label="Capital office: ' + (vc ? 'a funded VC bid is open' : 'no bids for your shares yet') + '"')}${a.mandate || a.mandateCompleted ? control(live, 'open-panel', 'pit-office pit-atlas', `<span>ATLAS MANDATE</span><b>Block trade ${a.mandateCompleted ? 'complete' : a.time >= a.mandate.until ? 'closed' : 'open'}</b>`, 'data-panel="mandate"') : ''}</div>
      ${founders(g, ui, open)}
      ${whaleSeat(g, m.whale, open)}
      <div class="pit-center" aria-hidden="true"><div class="pit-center-inset"><b>HSC</b></div></div>
      <div class="pit-stations">${booths}</div>
    </div>
    <div class="pit-desk-rest">
      <div class="pit-memo ${memo ? 'is-update' : ''}"><span class="pit-memo-tag">${memo ? 'DEAL UPDATE' : 'MEMO'}</span><p>${esc(memo || cue)}</p></div>
      ${control(live, 'open-panel', `pit-book ${held ? 'has-stock' : ''}`, `<span class="pit-book-tag">YOUR BOOK</span><span class="pit-book-chips">${chips.length ? chips.map(([k, n]) => `<span class="pit-chip pit-chip-${k.toLowerCase()}"><b>${n}</b> ${k}</span>`).join('') : '<span class="pit-book-empty">Empty</span>'}</span>${held ? `<small><b>${sum(inventoryCost(g))}</b> at risk · expires at the bell</small>` : '<small>Nothing at risk</small>'}`, `data-panel="stock" aria-label="Your book: ${held ? `${plural(held, 'GPU')} held, ${sum(inventoryCost(g))} at risk, expires at the bell` : 'empty'}. Open your compute book"`)}
      ${control(live, 'open-market', 'pit-ledger', `<span class="pit-ledger-tag">MARKET</span><b>${liveCount} live</b><i aria-hidden="true">→</i>`, `data-filter="all" aria-label="Market ledger: ${liveCount} live counterparties"`)}
      ${control(live, 'finish-review', 'pit-bell', `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6c-1.4 0-2.4 1-2.4 2.3v1.1C11.9 10.6 9 15.3 9 21v6.2L5.8 31h28.4L31 27.2V21c0-5.7-2.9-10.4-8.6-11.6V8.3C22.4 7 21.4 6 20 6z"/><circle cx="20" cy="33.4" r="3"/></svg><span>End round</span>`, 'aria-label="End round"')}
    </div>
  </section>`;
}

// The desk frame: no modal over a blurred room. A dock below the never-dimmed HUD holds a
// band (the counterparty at the far edge of your desk), the desk instrument and the rail.
export function focusFrame(g, view) {
  const identity = view.identity, identityRole = identity?.role || view.role || 'capital';
  const role = ['seller', 'buyer', 'startup', 'capital'].includes(identityRole) ? identityRole : 'capital';
  const desk = view.desk || (identity ? 'deal' : 'paper');
  const exit = view.exit === null || g.phase !== 'floor' ? null : view.exit || { action: 'close-focus', label: 'Floor' };
  const roleName = role === 'seller' ? 'SUPPLIER' : role === 'buyer' ? 'FUNDED BUYER' : role === 'startup' ? 'STARTUP FOUNDER' : 'CAPITAL OFFICE';
  return `<div class="pit-focus-scrim ${identity ? 'has-band' : 'is-paper'}"><section class="pit-focus ${identity ? 'has-identity' : 'is-paper'} tone-${esc(view.tone || 'plain')} focus-${esc(view.role || 'deal')} desk-${esc(desk)}" data-desk="${esc(desk)}" role="dialog" aria-modal="true" aria-labelledby="focus-title" tabindex="-1">
    <header class="pit-focus-heading">${exit ? button(exit.action, `<span class="exit-arrow" aria-hidden="true"></span><span class="exit-label">${esc(exit.label)}</span>`, `class="pit-focus-close mat-exit" aria-label="${esc(exit.aria || exit.label)}"`) : ''}<h2 id="focus-title">${esc(view.title)}</h2></header>
    ${identity ? `<aside class="pit-counterparty ${role}" data-mood="${esc(identity.mood || 'neutral')}"><div class="pit-bust" data-fx-figure aria-hidden="true">${person(role, identity.name)}</div><div class="pit-bubble" data-fx-bubble>${identity.reaction ? `<strong class="pit-reaction">${esc(identity.reaction)}</strong>` : ''}${identity.line ? `<blockquote>“${esc(identity.line)}”</blockquote>` : ''}</div><div class="pit-nameplate"><span class="pit-counterparty-role">${roleName}</span><h3>${esc(identity.name)}</h3>${identity.subtitle ? `<p>${esc(identity.subtitle)}</p>` : ''}</div></aside>` : ''}
    <div class="pit-focus-body" data-desk="${esc(desk)}">${view.body || ''}</div>
    <footer class="pit-focus-footer">${view.footer || ''}</footer>
  </section></div>`;
}

// Page size follows the composition: two ledger columns of four on a desk, four rows on a phone.
const compact = () => { try { return matchMedia('(max-width: 760px)').matches; } catch { return false; } };

export function directoryView(g, ui = {}) {
  const a = g.arcade, m = market(g, ui), filter = ['supply', 'buyers'].includes(ui.marketFilter) ? ui.marketFilter : 'all';
  const only = list => ui.gpu ? list.filter(({ item }) => item.gpu === ui.gpu) : list;
  const suppliers = only(m.lots.map(item => ({ item, role: 'seller' }))), buyers = only(m.buyers.map(item => ({ item, role: 'buyer' })));
  const row = ({ item, role }) => {
    const seller = role === 'seller', name = seller ? item.firm : item.name, qty = seller ? item.qty : buyerQty(item), price = seller ? item.negotiation?.price ?? item.ask : item.rate;
    const opening = seller ? item.ask : item.openingRate ?? item.rate, primary = !seller && item.id === m.primaryBuyer?.id;
    return `<button type="button" class="pit-market-row ${role} ${item.whale ? 'is-whale' : ''} ${primary ? 'is-primary' : item.gpu === m.relevantGPU ? 'is-relevant' : ''}" data-action="${seller ? 'focus-supplier' : 'focus-buyer'}" data-id="${esc(item.id)}" aria-label="${seller ? 'Supplier' : 'Buyer'} ${esc(name)}: ${qty} ${esc(item.gpu)} at ${rate(price)} per GPU-hour, ${sum(cents(qty, price))} ${seller ? 'lot' : 'funded'}, ${Math.ceil(Math.max(0, item.until - a.time))} seconds left"><span class="pit-market-face" aria-hidden="true">${person(role, name)}</span><span class="pit-market-who"><small class="pit-market-role">${seller ? item.favor ? `HELD FOR YOU · TRUST ${g.firms[item.firm]?.trust ?? 0}` : 'SUPPLIER' : item.whale ? 'THE WHALE · FINAL BID' : 'BUYER'}</small><b>${esc(name)}</b></span><strong class="pit-market-rate">${price !== opening ? `<s>${rate(opening)}</s>` : ''}${rate(price)}<small>/h</small></strong><span class="pit-market-lot"><span>${qty} ${gpu(item.gpu)}</span><span class="pit-dot">${sum(cents(qty, price))}</span></span>${fuse(item.until, item.at, a.time)}</button>`;
  };
  // A desk shows both sides of the market as two ledger columns; a phone pages one list.
  const split = !compact() && filter === 'all', size = split ? 4 : compact() ? 4 : 8;
  const entries = filter === 'supply' ? suppliers : filter === 'buyers' ? buyers : Array.from({ length: Math.max(suppliers.length, buyers.length) }, (_, i) => [suppliers[i], buyers[i]]).flat().filter(Boolean);
  const pages = Math.max(1, split ? Math.ceil(Math.max(suppliers.length, buyers.length) / size) : Math.ceil(entries.length / size)), page = Math.max(0, Math.min(pages - 1, Number(ui.page) || 0));
  const cut = list => list.slice(page * size, page * size + size);
  const empty = '<p class="pit-market-empty">No live quotes in this view. Return to the floor for the next arrival.</p>';
  const list = !entries.length ? `<div class="pit-market-list">${empty}</div>`
    : split ? `<div class="pit-market-list is-split"><div class="pit-market-col seller"><h3>Suppliers</h3>${cut(suppliers).map(row).join('')}</div><div class="pit-market-col buyer"><h3>Buyers</h3>${cut(buyers).map(row).join('')}</div></div>`
    : `<div class="pit-market-list">${cut(entries).map(row).join('')}</div>`;
  const filters = [['all', 'All', m.lots.length + m.buyers.length], ['supply', 'Suppliers', m.lots.length], ['buyers', 'Buyers', m.buyers.length]];
  return { title: ui.gpu ? `${ui.gpu} on the floor` : 'Market ledger', role: 'market', desk: 'ledger',
    body: `<div class="pit-directory"><nav class="pit-market-filters" aria-label="Market type">${filters.map(([key, label, n]) => button('open-market', `${label} <b>${n}</b>`, `class="pit-tab" data-filter="${key}" aria-pressed="${filter === key}"`)).join('')}</nav><div class="pit-ledger-sheet">${list}</div></div>`,
    footer: `<div class="pit-directory-footer"><div class="pit-pagination">${button('market-page', 'Prev', `class="pit-page-prev" data-step="-1" aria-label="Previous page" ${page === 0 ? 'disabled' : ''}`)}<span aria-label="Page ${page + 1} of ${pages}">Page <b>${page + 1}</b>/${pages}</span>${button('market-page', 'Next', `class="pit-page-next" data-step="1" aria-label="Next page" ${page >= pages - 1 ? 'disabled' : ''}`)}</div><nav class="pit-directory-rooms" aria-label="Other exchange desks">${button('open-panel', 'Capital office', 'class="pit-door-btn" data-panel="capital"')}${a.mandate || a.mandateCompleted ? button('open-panel', 'Atlas mandate', 'class="pit-door-btn" data-panel="mandate"') : ''}</nav></div>` };
}
