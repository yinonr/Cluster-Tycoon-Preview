// The Broker's Desk: every deal is played on one fixed instrument. THEIR number | GAP | YOUR
// number, read left to right like a ledger line; commits live in the rail. Every figure is an
// engine value or exact arithmetic of recorded fields (see pit-ledger.js).
import { parseRate } from './offers.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cashCapacity, cents, deliveryQuote, fortune, inventoryCost, owned, remaining, score, V7 } from '../tycoon/arcade.js';
import { buyerLive, saleQuote } from '../tycoon/arcade-buyers.js';
import { maxSaleBps, secondaryQuote, vcLive } from '../tycoon/arcade-vc.js';
import { mandateQuote } from '../tycoon/mandate.js';
import { matchedProjection } from '../tycoon/pit-transactions.js';
import { charmView, charmVerdict, frozenMeter, verdictLabel } from './pit-charm.js';
import { rivalQuotes } from '../tycoon/arcade-negotiation.js';
import { money, signed, rate, supplierNews, buyerMood, charmLosses, verdictOf, salePayoff, purchasePayoff } from './pit-ledger.js';
import * as floor from './pit-stage.js';

export { money };
const pct = n => `${(n * 100).toFixed(3)}%`;
const button = (action, label, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${label}</button>`;
const close = (label = 'Back to the floor') => button('close-focus', label, 'class="mat-exit rail-quiet"');
const number = n => esc(String(n));
const metric = (label, value, tone = '') => `<div class="deal-metric ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
const metrics = (...rows) => `<div class="deal-metrics">${rows.join('')}</div>`;
const note = (text, tone = '') => `<p class="deal-note ${tone}">${text}</p>`;
const hero = (label, value, subtitle = '') => `<div class="deal-quote"><span>${label}</span><strong>${value}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}</div>`;
const input = (attr, value, min = 1, max = 999, step = 1, label = '', cls = '') => `<input ${attr} ${cls ? `class="${cls}"` : ''} type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${number(value)}" aria-label="${esc(label)}">`;
const contractDetails = body => `<details class="deal-details"><summary>Contract & accounting</summary>${body}</details>`;
const identity = (name, role, subtitle = '', line = '', reaction = '', mood = 'neutral') => ({ name, role, subtitle, line, reaction, mood });
const chip = s => `<i class="t-chip" aria-hidden="true">${s}s</i>`;
const secs = (until, now) => Math.max(0, Math.ceil(until - now));
const fuse = (until, at, now) => { const left = Math.max(0, until - now), span = Math.max(1, until - at); return `<span class="desk-fuse ${left < 8 ? 'is-short' : ''}" data-fuse style="--left:${Math.min(1, left / span).toFixed(3)}"><b data-station-until="${until}" data-station-at="${at}">${Math.ceil(left)}s</b></span>`; };
const rail = (fact, cls = '') => `<span class="rail-fact ${cls}">${fact}</span>`;
const vault = (action, word, amount, attrs = '') => button(action, `<span class="vault-lock" aria-hidden="true"></span><b>${word}</b>${amount ? `<span class="vault-amt">${amount}</span>` : ''}`, `class="mat-vault rail-commit" data-primary ${attrs}`);
const wide = (short, more) => `${short}<span class="wide"> ${more}</span>`;
const face = (role, name) => typeof floor.person === 'function' ? floor.person(role, name) : '<span class="face-mono"></span>';
const draftTotal = (qty, offer) => Number.isSafeInteger(offer) && offer > 0 ? money(cents(qty, offer)) : '—';
const gapFigs = (qty, diff) => diff ? `<b>${money(cents(qty, Math.abs(diff)))}</b><small>${Math.abs(diff)}¢/h</small>` : '';

// Live previews: the controller paints these into [data-counter-total], [data-counter-gap],
// [data-offer-label] (and the buyer equivalents) on every keystroke or cent step.
export function supplierCounterPreview(g, offer) {
  const l = activeLot(g), n = l?.negotiation;
  const open = !!n && available(g, l) && !n.running && !n.closed && !n.attempts.length && n.patience > 0;
  const valid = open && Number.isSafeInteger(offer) && offer > 0 && offer < n.price;
  if (!n) return { valid: false, html: '—', gap: '', label: '' };
  // After a reply the slip resets to their number: neutral copy, never an error.
  const label = valid ? `OFFER ${money(cents(l.qty, offer))}` : !open ? 'No offers left'
    : offer === n.price ? `Step down<span class="wide"> to offer</span>` : Number.isSafeInteger(offer) && offer > n.price ? 'Above their quote' : 'Whole cents only';
  const gap = Number.isSafeInteger(offer) && offer > 0 && offer <= n.price ? gapFigs(l.qty, n.price - offer) : '<b>—</b>';
  return { valid, html: offer === n.price ? `<span class="is-match">${draftTotal(l.qty, offer)}</span>` : draftTotal(l.qty, offer), gap, label };
}

export function buyerCounterPreview(g, offer, qty) {
  const b = g.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId);
  if (!b) return { valid: false, html: '—', gap: '', label: '' };
  const okQty = Number.isSafeInteger(qty) && qty > 0 && qty <= b.qty - b.filled;
  const open = buyerLive(g, b) && b.negotiation.counters < 2;
  const valid = open && okQty && Number.isSafeInteger(offer) && offer > b.rate && offer <= 99900;
  const label = valid ? `ASK ${money(cents(qty, offer))}` : !open ? 'Final bid' : !okQty ? 'Choose whole GPUs' : offer === b.rate ? `Step up<span class="wide"> to ask</span>` : Number.isSafeInteger(offer) && offer > 0 && offer < b.rate ? 'Below their bid' : 'Whole cents only';
  const gap = okQty && Number.isSafeInteger(offer) && offer >= b.rate ? gapFigs(qty, offer - b.rate) : '<b>—</b>';
  return { valid, html: !okQty ? '—' : offer === b.rate ? `<span class="is-match">${draftTotal(qty, offer)}</span>` : draftTotal(qty, offer), gap, label };
}

// THEIR BID plate contents; repainted when the quantity or ask changes.
export function buyerQuoteView(g, qty) {
  const b = g.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId);
  if (!b) return { valid: false, html: '' };
  const d = saleQuote(g, b.id, qty), now = g.arcade.time;
  const head = `<header class="plate-head"><span>${wide('THEIR', 'BID')}</span>${fuse(b.until, b.at, now)}</header>`;
  const funded = buyerLive(g, b) && Number.isSafeInteger(qty) && qty > 0 && qty <= b.qty - b.filled && cents(qty, b.rate) <= b.budget;
  if (!funded) return { valid: false, html: `${head}<strong class="plate-total money-hero">—</strong><small class="plate-sub negative">Choose up to ${Math.max(0, Math.min(b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))))} funded GPUs</small>` };
  const profit = d ? d.revenue - d.cost : null;
  return { valid: !!d, html: `${head}<strong class="plate-total money-hero" data-fx-quote data-fx-per="${cents(qty, 1)}">${money(cents(qty, b.rate))}</strong><small class="plate-sub">${rate(b.rate)}/h ×${qty} ${esc(b.gpu)}</small>${d ? `<p class="plate-note ${profit >= 0 ? 'positive' : 'negative'}">${profit >= 0 ? signed(profit) : money(profit)} ${profit >= 0 ? 'profit' : 'loss'} if signed</p>` : ''}` };
}

export function startupQuoteView(g, orderId, qty, payment) {
  const o = g.arcade.orders.find(o => o.id === orderId), d = o && g.arcade.time < V7.seconds && deliveryQuote(g, orderId, qty, payment);
  if (!d) return { valid: false, html: note('Choose whole GPUs within your stock and this order. Cash payment also needs enough startup cash.', 'negative') };
  const s = g.startups.find(s => s.id === o.client);
  return { valid: true, html: payment === 'cash'
    ? metrics(metric('Cash received', money(d.revenue)), metric('Profit if signed', money(d.revenue - d.cost), d.revenue >= d.cost ? 'positive' : 'negative')) + note(`FIFO cost basis ${money(d.cost)}.`)
    : metrics(metric('Ownership received', `+${pct(d.stake - s.stake)}`), metric('Cash received', '$0')) + note(`Compute cost ${money(d.cost)} becomes a realized expense. Ownership after delivery: ${pct(d.stake)}.`, 'equity') };
}

export function secondaryQuoteView(g, bps) {
  const d = secondaryQuote(g, g.arcade.confirm?.vcId, bps);
  if (!d) return { valid: false, html: note('Choose a portion within this bid’s ownership, capital and deadline limits.', 'negative') };
  return { valid: true, html: metrics(metric('Cash received', money(d.proceeds)), metric('Ownership retained', pct(d.remaining))) + note(`You transfer ${pct(d.sold)} of the company. Historical basis ${money(d.basis)}; economic gain/loss ${money(d.gain)}.`) };
}

function selectedProjection(g, l, ui) {
  const buyerId = g.arcade.sourcingFor || ui.buyerId;
  const o = g.arcade.orders.find(o => o.id === ui.orderId) || g.arcade.orders.find(o => o.client === g.arcade.anchor && o.gpu === l.gpu);
  return matchedProjection(g, l.id, { buyerId, orderId: buyerId ? undefined : o?.id });
}

// Cent keys: bakelite, ±5¢ heavier, each printed with its dollar weight on this lot.
function keys(kind, qty, inputHTML) {
  const key = n => button('step-offer', `<b>${n < 0 ? '−' : '+'}${Math.abs(n)}¢</b><small class="w${Math.abs(n)}">${money(cents(qty, Math.abs(n)))}</small>`,
    `class="mat-key key-${Math.abs(n)}" data-kind="${kind}" data-step="${n}" aria-label="${n < 0 ? 'Decrease' : 'Increase'} ${kind} proposal by ${Math.abs(n)} cents, ${money(cents(qty, Math.abs(n)))} on this lot"`);
  return `<div class="keys">${key(-5)}${key(-1)}<label class="ink-field">${inputHTML}</label>${key(1)}${key(5)}</div>`;
}

// THEIR plate: a CRT in a brass bezel. The struck figure and delta chip are the last recorded move.
function theirPlate(g, l, news, { delta = true, closed = '' } = {}) {
  const n = l.negotiation, now = g.arcade.time, total = cents(l.qty, n.price);
  const moved = news && Number.isFinite(news.before) && Number.isFinite(news.after) && news.before !== news.after;
  const was = moved ? `<span class="plate-news"><s class="wide-s">${money(cents(l.qty, news.before))}</s>${delta ? `<i class="delta ${news.after < news.before ? 'down' : 'up'}">${signed(cents(l.qty, news.after - news.before))}</i>` : ''}</span>` : '';
  return `<section class="plate their ${closed ? 'is-closed' : ''}" data-fx-board aria-label="Their quote ${money(total)}"><header class="plate-head"><span>${wide('THEIR', 'QUOTE')}</span>${closed ? `<span class="plate-off">CLOSED</span>` : fuse(l.until, l.at, now)}</header>${closed ? '' : was}${closed ? `<strong class="plate-total money-hero"><s data-fx-quote data-fx-per="${cents(l.qty, 1)}">${money(total)}</s></strong>` : `<strong class="plate-total money-hero" data-fx-quote data-fx-per="${cents(l.qty, 1)}">${money(total)}</strong>`}<small class="plate-sub">${rate(n.price)}/h ×${l.qty} ${esc(l.gpu)}</small>${closed ? `<strong class="closed-stamp" data-fx-verdict>${closed}</strong>` : ''}</section>`;
}

function supplierReaction(l) {
  const n = l.negotiation, r = [...n.tape].reverse().find(t => t.speaker !== 'YOU'), last = n.attempts.at(-1);
  if (n.running) return ['Make your pitch', 'Let’s see what you’ve got.'];
  // A closed desk speaks in the engine's own last words.
  if (l.status === 'walked') return ['Supplier walked', r?.text || 'This desk is closed to you.'];
  if (l.status === 'expired' || r?.outcome === 'expired') return ['Quote expired', r?.outcome === 'expired' ? r.text : 'Too late. That allocation is closed.'];
  if (last) { const label = last.tier === 'hit' ? `${last.precision} Charm` : last.tier === 'near' ? 'Near miss' : 'Charm missed'; return [label, r?.text]; }
  const label = { accept: 'Offer accepted', counter: 'Counteroffer', hold: 'Offer rejected', match: 'Rival matched', beat: 'Rival beaten', decline: 'Rival refused' }[r?.outcome] || 'Opening quote';
  // Posture tells come from the seller's own truthful lines: firm desks never move on a counter, only on the market.
  const line = ['match', 'beat', 'decline'].includes(r?.outcome) ? r.text.replace(/ That is my last counter.*$/, '') : r?.outcome === 'accept' ? `Agreed. ${rate(n.price)}. Shall we sign?` : r?.outcome === 'counter' ? `Meet me at ${rate(n.price)}. Your move.` : r?.outcome === 'hold' ? (n.posture === 'firm' && /^That number does not work/.test(r.text) ? `Haggling won’t move me. Show me a better quote.` : `No deal at that number. ${rate(n.price)} stands.`) : n.tape[0]?.text || 'Bring me your number. Let’s talk.';
  return [n.patience === 0 && !n.closed ? `${label} · final quote` : label, line];
}

function supplierView(g, ui) {
  const a = g.arcade, l = activeLot(g), n = l.negotiation, now = a.time, cost = cents(l.qty, n.price), live = available(g, l) && !n.closed;
  const news = supplierNews(l), [reaction, line] = supplierReaction(l);
  const sourcing = a.sourcingFor ? a.buyers.find(b => b.id === a.sourcingFor) : null;
  const who = identity(l.firm, 'seller', n.running ? `${l.qty} ${l.gpu}` : n.rapport || n.posture, line, reaction, news.mood);
  const back = label => sourcing ? button('return-buyer', label ? esc(label) : esc(sourcing.name).replace(/ (.+)$/, '<span class="wide"> $1</span>'), `class="mat-exit rail-back" aria-label="Return to ${esc(sourcing.name)}"`) : '';
  const base = { role: 'seller', tone: 'negotiation', identity: who };

  // Charm running: the whole desk is the stop surface. No exit, no commits in the rail.
  if (n.running) return { ...base, title: 'Charm meter', desk: 'charm', exit: null, body: charmView(g, l), footer: rail('Leaving now counts as a severe miss', 'rail-warn') };

  // Closed desk: struck quote, stamp, recorded losses from attempts[] only, one way out.
  if (!live) {
    const stamp = l.status === 'walked' ? 'WALKED' : 'EXPIRED', loss = charmLosses(n, l.qty), entry = n.attempts.at(-1), v = verdictOf(entry, l.qty);
    const minus = x => `${x}`.replace('-', '−');
    const facts = loss ? [loss.gaveBack ? `Gave back ${money(loss.gaveBack)}` : '', loss.trust ? `Trust ${minus(loss.trust)}` : '', loss.clout ? `Clout ${minus(loss.clout)}` : '', v?.stamp === 'EXPIRED' && v.timeCost ? `${v.timeCost}s spent` : ''].filter(Boolean) : [];
    return { ...base, title: stamp === 'WALKED' ? 'Desk closed' : 'Window closed', desk: 'closed', exit: null,
      body: `<div class="desk-center"><div class="closed-desk desk-verdict" data-autofocus tabindex="-1" role="group" aria-label="${stamp === 'WALKED' ? 'Supplier walked' : 'Quote expired'}. No purchase was made.${facts.length ? ' ' + facts.join(', ') + '.' : ''}">${theirPlate(g, l, null, { closed: stamp })}<div class="verdict-block closed-ledger tone-miss">${frozenMeter(entry)}<p class="closed-facts">${facts.length ? facts.map(f => `<span>${f}</span>`).join(' ') : '<span>No purchase made</span>'}</p></div></div></div>`,
      footer: sourcing ? back(`Back to ${sourcing.name}`).replace('rail-back', 'rail-back rail-solo') : moveOn('close-focus', 'Back to the floor').replace('rail-commit', 'rail-commit rail-solo') };
  }

  const saved = cents(l.qty, l.ask - n.price), lastMove = news && Number.isFinite(news.before) ? cents(l.qty, news.before - news.after) : 0;
  const projection = (a.sourcingFor || ui.buyerId) && selectedProjection(g, l, ui);
  const resale = projection ? `<span class="${projection.conditionalProfit < 0 ? 'neg' : 'pos'}">${projection.conditionalProfit < 0 ? money(projection.conditionalProfit) : signed(projection.conditionalProfit)}</span> if ${projection.qty} resell` : '';
  const bank = cost > cash(g)
    ? vault('buy', `Need ${money(cost - cash(g))} more`, '', `disabled aria-label="Bank locked: need ${money(cost - cash(g))} more cash"`)
    : vault('buy', n.haggles || n.attempts.length ? 'BANK' : 'ACCEPT', money(cost), `aria-label="${n.haggles || n.attempts.length ? 'Bank' : 'Accept'} this quote: ${money(cost)}"`);
  const exit = { action: 'close-focus', label: 'Step away', aria: 'Step away: quote kept, desk cools 5 seconds' };

  // After any Charm: the frozen verdict, then the equal choice (next Push in the card, Bank in the rail).
  if (n.attempts.length) {
    return { ...base, title: 'Charm verdict', desk: 'verdict', exit,
      body: `<div class="face-off verdict-face desk-verdict" data-autofocus tabindex="-1" role="group" aria-label="${esc(verdictLabel(l))}">${theirPlate(g, l, news, { delta: false })}<div class="verdict-col">${charmVerdict(l)}</div><div class="leverage"><div class="deal-charm">${charmView(g, l)}</div></div></div>`,
      footer: (sourcing ? back() : rail(saved > 0 ? `${money(saved)} saved from ask` : `Charm ${n.attempts.length}/3 used`, 'wide-only')) + bank };
  }

  const offer = ui.counter ?? ((n.haggles ? n.price : Math.max(1, n.price - 8)) / 100).toFixed(2), preview = supplierCounterPreview(g, parseRate(offer));
  const rival = rivalQuotes(g)[0];
  const rivalCard = rival ? `<div class="rival-slip mat-carbon"><div><span>${wide('Rival', 'quote')}</span><b>${esc(rival.firm)} · ${rate(rival.rate)}/h</b>${l.until <= now + 2 ? '<em>Using it now expires this quote.</em>' : ''}</div>${button('play-rival', `Slap it${'<span class="wide"> down</span>'} ${chip(2)}`, `data-id="${esc(rival.id)}" class="rival-play" aria-label="Tell ${esc(l.firm)} that ${esc(rival.firm)} is quoting ${rate(rival.rate)} per GPU-hour for ${rival.qty} ${esc(l.gpu)}, ${secs(rival.until, now)} seconds left. One play per desk; uses one offer and 2 seconds."`)}</div>`
    : n.leverage ? `<p class="rival-played mat-carbon"><span>Played</span><b>${esc(n.leverage.firm)} ${rate(n.leverage.rate)}</b></p>` : '';
  const slip = n.patience > 0
    ? `<section class="slip yours mat-paper" aria-label="Your offer"><header class="plate-head"><span>${wide('YOUR', 'OFFER')}</span></header><strong class="slip-total money-hero" data-counter-total aria-live="polite">${preview.html}</strong>${keys('supplier', l.qty, input('data-counter', offer, .01, (n.price / 100).toFixed(2), .01, 'Your supplier proposal in dollars per GPU-hour'))}${button('haggle', `<span data-offer-label>${preview.label}</span>${chip(2)}`, `class="mat-strip ${preview.valid ? 'is-lit' : ''}" ${preview.valid ? '' : 'disabled'} aria-label="Make this offer; uses 2 seconds"`)}</section>`
    : `<section class="slip yours mat-paper is-spent"><header class="plate-head"><span>YOUR OFFER</span></header><p class="slip-spent">No offers left</p></section>`;
  const fact = resale || (saved > 0 && saved !== lastMove ? `${money(saved)} saved` : '');
  const gap = `<div class="gap-col">${n.patience > 0 ? `<span class="gap-label">GAP</span><span class="gap-figs" data-counter-gap>${preview.gap}</span>` : ''}${fact ? `<p class="gap-fact">${fact}</p>` : ''}</div>`;
  return { ...base, title: 'Supply desk', desk: 'haggle', exit,
    body: `<div class="face-off supplier-face">${theirPlate(g, l, news)}${gap}${slip}<div class="leverage">${rivalCard}<div class="deal-charm">${charmView(g, l)}</div></div></div>`,
    footer: (sourcing ? back() : rail(n.patience ? `${n.patience} offer${n.patience === 1 ? '' : 's'} left` : 'Final quote', 'wide-only')) + bank };
}

function buyerView(g, ui) {
  const a = g.arcade, b = a.buyers.find(b => b.id === a.confirm.buyerId), n = b.negotiation, live = buyerLive(g, b), wanted = b.qty - b.filled, now = a.time;
  const funded = Math.min(wanted, Math.floor(b.budget / cents(1, b.rate))), stock = owned(g, b.gpu), qty = ui.qty ?? Math.max(1, Math.min(stock || funded, funded));
  const offer = ui.buyerCounter ?? ((b.rate + (n.counters ? 0 : 5)) / 100).toFixed(2), quote = buyerQuoteView(g, Number(qty)), counter = buyerCounterPreview(g, parseRate(offer), Number(qty));
  const r = n.tape.at(-1), reaction = !live ? (n.walked ? 'Buyer walked' : 'Order closed') : ({ accept: 'Bid raised', counter: 'Counteroffer', hold: 'Bid stands' }[r?.outcome] || 'Funded buyer');
  const line = !live ? 'This order is off the table.' : r?.outcome === 'hold' ? `That’s my limit. ${rate(b.rate)} stands.` : r?.outcome === 'accept' || r?.outcome === 'counter' ? `${rate(b.rate)}. My budget covers ${funded} ${b.gpu}.` : `I need ${funded} ${b.gpu}. What’s your number?`;
  const who = identity(b.name, 'buyer', `${funded} funded · ${stock} owned`, line, reaction, buyerMood(b, live));
  if (!live) return { title: 'Order closed.', role: 'buyer', tone: 'negotiation', identity: who, desk: 'closed', exit: null,
    body: `<div class="desk-center"><div class="closed-desk desk-verdict" data-autofocus tabindex="-1" role="group" aria-label="${n.walked ? 'Buyer walked' : 'Order closed'}. No sale made."><section class="plate their is-closed" data-fx-board><header class="plate-head"><span>THEIR BID</span><span class="plate-off">CLOSED</span></header><strong class="plate-total money-hero"><s>${rate(b.rate)}/h</s></strong><small class="plate-sub">${wanted} ${esc(b.gpu)} wanted</small><strong class="closed-stamp" data-fx-verdict>${n.walked ? 'WALKED' : 'CLOSED'}</strong></section><div class="verdict-block closed-ledger"><p class="closed-facts"><span>No sale made</span></p></div></div></div>`, footer: moveOn('close-focus', 'Back to the floor').replace('rail-commit', 'rail-commit rail-solo') };

  if (ui.buyerSources) {
    const lots = a.lots.filter(l => l.gpu === b.gpu && available(g, l) && !l.negotiation?.closed);
    const cards = lots.map(l => { const p = l.negotiation?.price ?? l.ask; return button('source-buyer', `<span class="src-face" aria-hidden="true">${face('seller', l.firm)}</span><span class="src-who"><b>${esc(l.firm)}</b><small>${l.qty} ${esc(l.gpu)}</small></span><strong class="src-rate">${rate(p)}<small>/h</small></strong><span class="src-total">${money(cents(l.qty, p))}</span>${fuse(l.until, l.at, now)}`, `data-id="${esc(l.id)}" class="source-card" aria-label="${esc(l.firm)}: ${l.qty} ${esc(l.gpu)} at ${rate(p)} per GPU-hour, ${money(cents(l.qty, p))} lot, ${secs(l.until, now)} seconds left"`); }).join('');
    return { title: 'Find supply', role: 'buyer', tone: 'negotiation', desk: 'sources', exit: { action: 'buyer-bargain', label: 'Their bid' },
      identity: { ...who, line: `Find me ${funded} ${b.gpu}.`, reaction: 'Waiting on supply' },
      body: lots.length ? `<div class="desk-center"><div class="source-cards count-${Math.min(lots.length, 6)}">${cards}</div></div>` : `<p class="desk-empty">No ${esc(b.gpu)} supply on the floor right now. New desks arrive during the round.</p>`,
      footer: rail('Nothing is reserved') };
  }

  const ask = n.counters < 2
    ? `<section class="slip yours mat-paper" aria-label="Your ask"><header class="plate-head"><span>${wide('YOUR', 'ASK')}</span><label class="qty-chip">GPUs ${input('data-sale-qty', qty, 1, wanted, 1, 'GPUs to sell')}</label></header><strong class="slip-total money-hero" data-buyer-proposal aria-live="polite">${counter.html}</strong>${keys('buyer', Number(qty) || 1, input('data-buyer-counter', offer, (b.rate / 100).toFixed(2), 999, .01, 'Your buyer proposal in dollars per GPU-hour'))}${button('counter-buyer', `<span data-ask-label>${counter.label}</span>${chip(2)}`, `class="mat-strip ${counter.valid ? 'is-lit' : ''}" ${counter.valid ? '' : 'disabled'} aria-label="Send this ask; uses 2 seconds"`)}</section>`
    : `<section class="slip yours mat-paper is-spent" aria-label="Final bid"><header class="plate-head"><span>FINAL BID</span><label class="qty-chip">GPUs ${input('data-sale-qty', qty, 1, wanted, 1, 'GPUs to sell')}</label></header><p class="slip-spent">No counters left</p></section>`;
  const gap = n.counters < 2 ? `<div class="gap-col"><span class="gap-label">GAP</span><span class="gap-figs" data-buyer-gap>${counter.gap}</span><p class="gap-fact">${2 - n.counters} counter${n.counters === 1 ? '' : 's'} left</p></div>` : '<div class="gap-col"></div>';
  return { title: 'Buyer desk', role: 'buyer', tone: 'negotiation', identity: who, desk: 'bid',
    body: `<div class="face-off buyer-face"><section class="plate their" data-fx-board aria-label="Their bid"><div data-sale-math>${quote.html}</div></section>${gap}${ask}</div>`,
    footer: `<span data-buyer-actions>${buyerActions(g, Number(qty))}</span>` };
}

// The rail on a buyer desk: one lit commit. SELL when the quantity is in your book, else SOURCE.
export function buyerActions(g, qty) {
  const b = g.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId);
  if (!b || !buyerLive(g, b)) return '';
  const sale = saleQuote(g, b.id, qty), want = Number.isSafeInteger(qty) && qty > 0 ? qty : Math.max(1, Math.min(b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))));
  if (sale) return button('buyer-sources', 'Source more', 'class="mat-exit rail-quiet"') + vault('sell-buyer', `SELL ${qty}`, money(sale.revenue), `aria-label="Sell ${qty} ${esc(b.gpu)} for ${money(sale.revenue)}: review the contract"`);
  return vault('buyer-sources', `SOURCE ${want} ${esc(b.gpu)}`, '', `aria-label="Find ${want} ${esc(b.gpu)} from suppliers on the floor"`);
}

const paper = html => `<div class="desk-center"><div class="paper-sheet mat-paper">${html}</div></div>`;
const stampLine = (action, label, attrs = '') => `<div class="sign-line">${button(action, label, `class="mat-stamp is-lit" data-primary ${attrs}`)}<span class="sig-rule" aria-hidden="true">x</span></div>`;
const paperHead = (left, right) => `<header class="contract-head"><span>${left}</span><span>${right}</span></header>`;

function contractView(g, d) {
  const purchase = d.kind === 'purchase', secondary = d.kind === 'secondary', mandate = d.kind === 'mandate';
  let terms, sub;
  if (purchase) { terms = `BUY ${d.qty} ${esc(d.gpu)} from ${esc(d.counterparty)}`; sub = `${rate(d.rate)}/h · ${d.savings > 0 ? `${money(d.savings)} under their opening ask` : 'at their opening ask'}`; }
  else if (secondary) { const q = secondaryQuote(g, g.arcade.confirm?.vcId, d.bps); terms = `TRANSFER ${d.qty.toFixed(3)}% ${esc(d.gpu.replace(/^% of /, 'of '))}`; sub = q ? `Historical basis ${money(q.basis)} · gain ${money(q.gain)}` : 'Cash on signature'; }
  else { const p = d.total - d.cost; terms = `${mandate ? 'DELIVER' : 'SELL'} ${d.qty} ${esc(d.gpu)} to ${esc(d.counterparty)}`; sub = `FIFO cost ${money(d.cost)} · realizes ${p >= 0 ? signed(p) : money(p)}`; }
  const after = purchase ? cash(g) - d.total : cash(g) + d.total;
  return { title: 'The contract', desk: 'contract', exit: { action: 'cancel-sign', label: 'Keep negotiating' },
    role: purchase ? 'seller' : secondary ? 'capital' : 'buyer', tone: 'signing',
    identity: identity(d.counterparty, purchase ? 'seller' : secondary ? 'capital' : 'buyer', 'Contract ready', 'One signature makes it official.', '', 'pleased'),
    body: `<div class="desk-center"><article class="contract mat-paper" data-fx-contract>${paperHead('HSC · EXECUTION COPY', purchase ? 'PURCHASE' : secondary ? 'SHARE TRANSFER' : 'SALE')}<p class="contract-terms">${terms}</p><strong class="contract-total money-hero">${money(d.total)}</strong><p class="contract-sub">${sub}</p><div class="sign-line">${button('sign-it', `SIGN · ${purchase ? 'PAY' : 'RECEIVE'} ${money(d.total)}`, 'class="mat-stamp is-lit" data-primary')}<span class="sig-rule" aria-hidden="true">x</span></div><p class="contract-fine">Signing rechecks the quote, deadline, stock and cash.</p></article></div>`,
    footer: rail(`Cash after ${money(after)}`) };
}

// The receipt's rail: the reason for the next encounter, as real data.
function receiptRail(g, d) {
  const a = g.arcade, stock = a.inventory.reduce((n, x) => n + x.left, 0);
  const primary = (action, label) => rail(stock ? `${stock} GPU${stock === 1 ? '' : 's'} in your book · ${money(inventoryCost(g))} at cost` : 'Book is empty', 'wide-only') + moveOn(action, label);
  if (d.kind !== 'purchase') return primary('post-receipt', 'Next deal');
  const b = a.sourcingFor ? a.buyers.find(x => x.id === a.sourcingFor) : null;
  if (b && buyerLive(g, b) && owned(g, b.gpu) > 0) {
    const qty = Math.min(owned(g, b.gpu), b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))), sale = qty > 0 && saleQuote(g, b.id, qty);
    if (sale) return button('post-receipt', 'Haggle their bid first', 'class="mat-exit rail-quiet"') + vault('post-receipt-sell', `SELL ${qty}${wide('', `TO ${esc(b.name.toUpperCase())}`)}`, money(sale.revenue), `data-qty="${qty}" aria-label="Sell ${qty} ${esc(b.gpu)} to ${esc(b.name)} for ${money(sale.revenue)}: open the sale contract"`);
    return primary('post-receipt', `Back to ${esc(b.name)}`);
  }
  return b ? primary('post-receipt', 'Next deal') : primary('post-receipt', 'Put it to work');
}

function receiptView(g, d) {
  const purchase = d.kind === 'purchase', equity = d.kind === 'startup' && d.payment === 'equity', secondary = d.kind === 'secondary', startupCash = d.kind === 'startup' && !equity;
  const role = purchase ? 'seller' : secondary ? 'capital' : d.kind === 'startup' ? 'startup' : 'buyer';
  let payoff, fine = '';
  if (purchase) {
    const p = purchasePayoff(d), tokens = `<span class="gpu-chips" aria-hidden="true">${`<i class="gpu-chip gpu-${esc(String(d.gpu).toLowerCase())}"></i>`.repeat(Math.min(8, p.qty))}</span>`;
    payoff = `<div class="payoff payoff-stock" data-fx-payoff>${tokens}<strong class="payoff-hero">${p.qty} ${esc(p.gpu)} into your book</strong><p class="payoff-sub">Paid ${money(p.paid)} · ${p.savings > 0 ? `${money(p.savings)} under their opening ask` : 'at their opening ask'}</p></div>`;
    fine = `<p class="payoff-fine">Realized profit $0 until you sell or deliver · expires at the bell</p>`;
  } else if (equity) {
    payoff = `<div class="payoff payoff-equity" data-fx-payoff>${hero('Ownership received', `+${pct(d.equityReceived ?? (d.stake - g.startups.find(s => s.id === g.arcade.orders.find(o => o.id === d.orderId)?.client)?.stake))}`, `${d.qty} ${esc(d.gpu)} delivered for startup shares`)}${metrics(metric('Cash received', '$0'), metric('Realized compute expense', money(d.cost), 'negative'))}</div>`;
    fine = `<p class="payoff-fine">Ownership after delivery ${pct(d.ownershipAfter ?? d.stake)}. Shares are speculative; no immediate cash profit.</p>`;
  } else if (secondary) {
    const sale = [...g.arcade.secondarySales].reverse().find(s => s.q === d.q && s.counterparty === d.counterparty && s.proceeds === d.total);
    payoff = `<div class="payoff payoff-cash" data-fx-payoff>${hero('Cash received', money(d.total), `${d.qty.toFixed(3)}% company ownership transferred`)}${metrics(metric('Historical basis allocated', money(sale?.basis || 0)), metric('Economic gain / loss', money(d.total - (sale?.basis || 0))))}</div>`;
    fine = `<p class="payoff-fine">Retained ownership ${pct(sale?.remaining || 0)}. Compute cost was expensed earlier; game profit rises by ${money(d.total)} without charging it twice.</p>`;
  } else {
    // Sales, Atlas and startup cash deliveries realize revenue − FIFO cost, win or lose.
    const s = salePayoff(d), cls = s.win ? 'win' : 'loss';
    payoff = `<div class="payoff payoff-${cls}" data-fx-payoff><span class="payoff-label">Realized profit</span><strong class="payoff-hero money-hero ${cls}">${s.profit >= 0 ? signed(s.profit) : money(s.profit)}</strong><p class="payoff-sub">${startupCash ? `Cash received ${money(s.revenue)}` : `${money(s.revenue)} revenue`} − ${money(s.cost)} FIFO cost basis</p><div class="spread-bar ${cls}" aria-hidden="true"><span class="bar-base" style="width:${s.base}%"></span><span class="bar-tail" style="width:${s.tail}%"></span></div><p class="spread-ends"><span>COST ${rate(Math.round(s.costRate))}/h</span><span>SOLD ${rate(s.soldRate)}/h</span></p></div>`;
  }
  const title = purchase ? 'Inventory secured.' : equity ? 'You own a piece of it.' : 'Deal on the tape.';
  return { title, role, tone: 'receipt', desk: 'receipt', exit: null,
    identity: identity(d.counterparty, role, `${d.qty} ${String(d.gpu).startsWith('%') ? 'ownership' : esc(d.gpu)} · signed`, purchase ? 'Your compute. Your next move.' : equity ? 'Now we build something.' : 'Good doing business.', '', 'pleased'),
    body: `<div class="desk-center"><article class="receipt mat-paper is-signed">${paperHead(`HSC · ${esc(d.id)}`, `<span class="wide">${esc(d.counterparty)}</span>`)}<strong class="deal-stamp" data-fx-stamp>SIGNED</strong>${payoff}${fine}</article></div>`,
    footer: receiptRail(g, d) };
}

function startupView(g, ui) {
  const o = g.arcade.orders.find(o => o.id === ui.orderId) || g.arcade.orders.find(o => o.client === g.arcade.anchor) || g.arcade.orders[0], s = g.startups.find(s => s.id === o.client);
  const stock = owned(g, o.gpu), qty = ui.qty ?? Math.max(1, Math.min(stock, remaining(o), cashCapacity(g, o) || stock)), payment = ui.payment || 'cash';
  const q = startupQuoteView(g, o.id, Number(qty), payment);
  const others = g.arcade.orders.length > 1 ? `<div class="deal-other-orders">${g.arcade.orders.filter(x => x.id !== o.id).map(x => button('focus-order', `${esc(x.name)} · ${remaining(x)} ${x.gpu}`, `data-id="${esc(x.id)}"`)).join('')}</div>` : '';
  return { title: 'The founder’s order', role: 'startup', desk: 'paper', identity: identity(s.name, 'startup', `${remaining(o)} ${o.gpu} still needed`, o.milestone ? 'You got our launch over the line.' : 'Keep our compute running. Cash, or make you an owner.', '', o.milestone ? 'pleased' : 'eager'),
    body: `<div class="desk-center"><div class="paper-sheet mat-paper" data-order="${esc(o.id)}">${paperHead('ORDER', `${o.delivered}/${o.qty} supplied`)}<div class="deal-bid"><b>${money(cents(remaining(o), o.rate))} remaining order</b><span>${rate(o.rate)}/h · ${stock} ${o.gpu} owned · ${cashCapacity(g, o)} cash-funded</span></div><div class="deal-field-row"><label>GPUs${input('data-order-qty', qty, 1, remaining(o), 1, 'GPUs to deliver')}</label><label>Payment<select data-payment aria-label="Startup payment"><option value="cash" ${payment === 'cash' ? 'selected' : ''}>Cash</option><option value="equity" ${payment === 'equity' ? 'selected' : ''}>Startup equity</option></select></label></div><div data-order-preview>${q.html}</div>` +
      (!stock && remaining(o) ? button('open-market', `Find ${o.gpu} suppliers`, `data-filter="seller" data-gpu="${o.gpu}" class="deal-inline-action mat-exit"`) : '') +
      contractDetails(`<p>Completing the order earns +1 startup Trust and +40 Clout. Startup cash ${money(Math.round(s.cash * 100))} · ownership ${pct(s.stake)} · ${Math.max(0, s.cash / Math.max(1, s.burn)).toFixed(1)} quarters runway.</p><p>Cash delivery books revenue minus FIFO cost. Equity delivery expenses compute immediately and changes ownership at the actual company valuation. Paper value is not cash.</p>${others}`) + '</div></div>',
    footer: rail(`${stock} ${o.gpu} in your book`) + vault('prepare', 'Review delivery', '', `data-id="${esc(o.id)}" ${q.valid ? '' : 'disabled'}`) };
}

// Delivery is conclusive, so it is stamped on the paper, away from the rail spot that opened it.
function deliveryView(g) {
  const c = g.arcade.confirm, d = g.arcade.time < V7.seconds && deliveryQuote(g, c.orderId, c.qty, c.payment), o = g.arcade.orders.find(o => o.id === c.orderId);
  if (!d) return { title: 'Delivery unavailable', role: 'startup', desk: 'paper', exit: null, body: paper(note('Inventory or startup funding changed. Review the order again.')), footer: close() };
  return { title: d.payment === 'cash' ? 'Deliver for cash.' : 'Take the startup upside.', role: 'startup', desk: 'contract', identity: identity(o.name, 'startup', `${d.qty} ${o.gpu} · ${d.payment === 'cash' ? 'Cash invoice' : 'Equity exchange'}`, 'Ready when you are.', '', 'eager'),
    body: `<div class="desk-center"><article class="contract mat-paper" data-fx-contract>${paperHead('HSC · DELIVERY', d.payment === 'cash' ? 'CASH' : 'EQUITY')}<p class="contract-terms">DELIVER ${d.qty} ${esc(o.gpu)} · ${V7.hours.toLocaleString('en-US')}-hour prepaid rights</p>${startupQuoteView(g, o.id, d.qty, d.payment).html}${stampLine('deliver', d.payment === 'cash' ? `SIGN · RECEIVE ${money(d.revenue)}` : 'SIGN · RECEIVE EQUITY')}<p class="contract-fine">${d.payment === 'equity' ? 'Shares cannot fund your next purchase until cash is actually received.' : 'Cash and inventory change together when you sign.'}</p></article></div>`,
    footer: button('review-order', 'Review order', 'class="mat-exit rail-quiet"') + rail(d.payment === 'cash' ? `Cash after ${money(cash(g) + d.revenue)}` : 'No cash moves') };
}

function stockView(g) {
  const stock = g.arcade.inventory.filter(x => x.left), types = [...new Set(stock.map(x => x.gpu))];
  const mandate = mandateQuote(g);
  return { title: 'Your compute book', role: 'stock', desk: 'paper', exit: null, body: paper(hero('Unexpired inventory at cost', money(inventoryCost(g)), `${stock.reduce((n, x) => n + x.left, 0)} prepaid GPUs · expire at the bell`) +
    (types.map(gpu => `<article class="deal-stock-row"><div><b>${owned(g, gpu)} ${gpu}</b><span>${money(stock.filter(x => x.gpu === gpu).reduce((n, x) => n + x.left * x.unitCost, 0))} basis</span></div>${button('open-market', 'Find buyers', `data-filter="buyer" data-gpu="${gpu}" class="mat-exit"`)}${g.arcade.orders.filter(o => o.gpu === gpu && remaining(o)).map(o => button('focus-order', esc(o.name), `data-id="${esc(o.id)}" class="mat-exit"`)).join('')}</article>`).join('') || note('Your book is empty. Choose a buyer, then source matching compute.')) +
    (mandate && owned(g, mandate.gpu) ? button('open-panel', `Atlas procurement · ${mandate.secured}/${mandate.qty} secured`, 'data-panel="mandate" class="deal-inline-action mat-exit"') : '') +
    (stock.length ? contractDetails(`<p>Rights expire at the round’s bell. Undelivered cost becomes a realized loss.</p>${stock.map(x => `<p>${esc(x.firm)} · ${x.left}/${x.qty} ${x.gpu} remaining · ${money(x.left * x.unitCost)} basis.</p>`).join('')}`) : '')), footer: close() };
}

function capitalView(g, ui) {
  const a = g.arcade, id = a.confirm?.vcId;
  if (id) {
    const b = a.vcOffers.find(b => b.id === id), s = g.startups.find(s => s.id === b.client), max = maxSaleBps(b), percent = ui.vcPercent ?? Math.min(25, max / 100), q = secondaryQuoteView(g, Math.round(Number(percent) * 100));
    return { title: 'Sell a piece of your upside', role: 'capital', desk: 'paper', identity: identity(b.name, 'capital', `${b.type} · ${s.name}`, 'Your ownership has a cash price. How much are you selling?', '', 'eager'),
      body: paper(`${hero('Funded secondary offer', money(b.budget), `${Math.max(0, Math.ceil(b.until - a.time))}s left · one acceptance`)}<label class="deal-quantity">% of your current stake${input('data-vc-percent', percent, 0.01, max / 100, 0.01, 'Percent of current stake to sell')}</label><div data-vc-math>${q.html}</div>${note(`Maximum ${(max / 100).toFixed(2)}% of your ${pct(s.stake)} stake. Bid valuation ${money(b.bidVal)}.`)}${contractDetails('<p>This transfers existing shares. The cash goes to you; the startup receives no funding. Sold shares lose future upside. A partial transfer uses this entire offer window.</p>')}`),
      footer: vault('sell-vc', 'Review share transfer', '', q.valid ? '' : 'disabled') };
  }
  const bids = a.vcOffers.filter(b => vcLive(g, b));
  return { title: 'The capital office', role: 'capital', desk: 'paper', exit: null, body: paper(note('Turn earned startup ownership into spendable cash when a funded investor bids.') +
    (bids.map(b => `<article class="deal-list-card"><div><b>${esc(b.name)}</b><span>${esc(g.startups.find(s => s.id === b.client)?.name)} · ${money(b.budget)} capital</span></div>${button('review-vc', 'Review bid', `data-id="${esc(b.id)}" class="mat-exit"`)}</article>`).join('') || note('No bids on the board.')) +
    contractDetails(g.startups.filter(s => a.investments[s.id]).map(s => { const i = a.investments[s.id]; return `<p><b>${esc(s.name)}</b> · ${pct(s.stake)} retained. Compute invested ${money(i.invested)}; secondary cash received ${money(i.proceeds)}; remaining historical basis ${money(i.basis)}.</p>`; }).join('') || '<p>Deliver compute for equity to begin a portfolio. Future offers depend on actual startup performance and funded investor demand.</p>')), footer: close() };
}

function mandateView(g) {
  const m = g.arcade.mandate, q = mandateQuote(g);
  if (!m || !q) return { title: m?.complete || g.arcade.mandateCompleted ? 'Atlas delivered.' : 'Procurement closed', role: 'buyer', desk: 'paper', exit: null, body: paper(note(m?.complete || g.arcade.mandateCompleted ? 'Atlas Meridian Cloud paid the assembled procurement. Your completed deal is in the ledger.' : 'There is no live procurement to sign.')), footer: close() };
  return { title: 'Three suppliers. One big deal.', role: 'buyer', desk: 'paper', identity: identity(m.name, 'buyer', `${m.qty} ${m.gpu} · ${m.suppliersRequired} suppliers`, 'Assemble the whole allocation. Then we pay in full.', '', 'eager'),
    body: paper(`${hero('Funded payment on full delivery', money(q.revenue), `${Math.max(0, Math.ceil(m.until - g.arcade.time))}s left`)}${metrics(metric('Compute secured', `${q.secured}/${m.qty} ${m.gpu}`), metric('Supplier firms', `${q.suppliers}/${m.suppliersRequired}`))}` +
      (q.ready ? metrics(metric('Delivered cost basis', money(q.cost)), metric('Profit if signed', money(q.margin), q.margin >= 0 ? 'positive' : 'negative')) : note('Source matching inventory from at least three firms. No payment for partial fulfillment.')) +
      contractDetails(`<p>Actual committed basis ${money(q.cost)}. The contract consumes exact inventory legs once and pays from a finite ${money(m.budget)} budget. Purchased surplus remains yours until the bell. No deposit, financing or partial payout.</p>`)),
    footer: (q.ready ? '' : button('open-market', 'Find suppliers', `data-filter="seller" data-gpu="${m.gpu}" class="mat-exit rail-quiet"`)) + vault(g.arcade.confirm?.mandate ? 'mandate-sign' : 'mandate-review', q.ready ? 'Review Atlas contract' : 'Assemble the allocation', '', q.ready ? '' : 'disabled') };
}

function fortuneBody(g) {
  const w = fortune(g);
  return hero('Estimated net worth', money(w.netWorth), `Started with ${money(V7.cash)}`) + metrics(metric('Spendable cash', money(w.cash)), metric('Estimated equity', money(w.equity)), metric('Inventory at cost', money(w.inventory)), metric('Realized profit to date', money(Math.round(g.profit * 100)))) +
    contractDetails(`<p>Cash + estimated live equity + unexpired inventory − ${money(w.liabilities)} liabilities. Profit is already reflected in these assets and is never added again.</p><p>Shares count at 25% of paper value, or 10% with less than one quarter of runway. This estimate is not a guaranteed sale price.</p>${w.holdings.map(h => `<p>${esc(h.name)} · ${money(h.paper)} paper × ${h.factor * 100}% = ${money(h.value)} estimated.</p>`).join('')}<p>Secondary Tycoon score ${score(g).total.toLocaleString('en-US')}; reputation and compute bonus ${score(g).bonus}, capped at 2% of wealth.</p>`);
}

const moveOn = (action, label) => button(action, `${label} <span aria-hidden="true">→</span>`, 'class="mat-move rail-commit" data-primary');

function reportView(g) {
  const r = g.arcade.history.at(-1), final = g.phase === 'over';
  return { title: final ? g.arcade.ending === 'completed' ? 'Your fortune, on the record.' : 'The trading desk closes.' : `Round ${r.q} · books closed`, role: 'report', desk: 'paper', exit: null,
    body: paper(final ? fortuneBody(g) + note(`${g.arcade.history.length}/18 rounds settled · ${g.arcade.history.reduce((n, h) => n + h.delivered, 0)} GPUs delivered to startups · ${g.arcade.secondarySales.length} secondary sales · Atlas ${g.arcade.mandateCompleted ? 'completed' : 'not completed'}.`) + note('Remaining shares are estimated, not cashed out.')
      : hero('Realized profit this round', money(Math.round(r.profit * 100)), `${r.delivered} GPUs to startups · ${r.outsideSold} to outside buyers`) + metrics(metric('Cash available', money(cash(g))), metric('Expired inventory loss', money(r.lost)), metric('Estimated net worth', money(fortune(g).netWorth))) +
        `<div class="deal-round-orders">${r.orders.map(o => note(`<b>${esc(o.name)}</b> · ${o.delivered}/${o.qty} ${o.gpu}${o.milestone ? ' · order complete' : ''}`)).join('')}</div><details class="deal-details"><summary>Startup fortunes & round ledger</summary>${r.startups.map(s => `<article><b>${esc(s.name)} · ${esc(s.status)}</b><p>${esc(s.text || '')} ${esc(s.delivery || '')}</p>${s.fortune ? `<p>${esc(s.fortune.headline)} · ${esc(s.fortune.status)} · actual growth ${Math.round(s.fortune.growth * 100)}%. Service contribution ${Math.round(s.fortune.serviceGrowth * 100)} growth points; commercial outcomes remain uncertain.</p>` : ''}</article>`).join('')}${r.lines.map(l => note(esc(l.text))).join('')}</details>`),
    footer: final ? moveOn('restart-review', 'New broker run') : button('restart-review', 'New run', 'class="mat-exit rail-quiet"') + moveOn('next', `Open round ${g.q} / 18`) };
}

export function dealView(g, ui = {}) {
  const a = g.arcade, c = a.confirm;
  // Irreversible confirmations are stamped on the paper, never on the rail spot that opened them.
  if (c?.restart) return { title: 'Start a fresh broker run?', role: 'report', desk: 'paper', exit: null, body: paper(note('This replaces your current V10.3 run. Its cash, deals and campaign progress will be reset.') + stampLine('restart', 'START FRESH')), footer: close('Keep this run') };
  if (g.phase !== 'floor') return reportView(g);
  if (a.signing) return contractView(g, a.signing);
  if (c?.receipt) return receiptView(g, c.receipt);
  if (c?.finish) return { title: 'Ring the closing bell?', role: 'report', desk: 'paper', exit: null, body: paper(hero('Unsold inventory expiring', money(inventoryCost(g)), 'Full cost becomes a realized loss; no refund.') + note('Startup deliveries settle and new finite opportunities arrive next round.') + stampLine('finish', 'SETTLE THIS ROUND')), footer: close('Keep trading') };
  if (a.active) return supplierView(g, ui);
  if (c?.buyerId) return buyerView(g, ui);
  if (c?.orderId) return deliveryView(g);
  if (c?.vcId) return capitalView(g, ui);
  if (c?.mandate) return mandateView(g);
  if (ui.panel === 'stock') return stockView(g);
  if (ui.panel === 'startup') return startupView(g, ui);
  if (ui.panel === 'capital') return capitalView(g, ui);
  if (ui.panel === 'mandate') return mandateView(g);
  if (ui.panel === 'fortune') return { title: 'Your fortune', role: 'capital', desk: 'paper', exit: null, body: paper(fortuneBody(g)), footer: close() };
  return null;
}
