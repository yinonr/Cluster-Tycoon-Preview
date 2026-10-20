// The Broker's Desk: every deal is played on one fixed instrument. THEIR number | GAP | YOUR
// number, read left to right like a ledger line; commits live in the rail. Every figure is an
// engine value or exact arithmetic of recorded fields (see pit-ledger.js).
import { parseRate } from './offers.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cashCapacity, cents, deliveryQuote, fortune, inventoryCost, owned, remaining, V7 } from '../tycoon/arcade.js';
import { buyerLive, saleQuote } from '../tycoon/arcade-buyers.js';
import { maxSaleBps, secondaryQuote, vcLive } from '../tycoon/arcade-vc.js';
import { mandateQuote } from '../tycoon/mandate.js';
import { matchedProjection } from '../tycoon/pit-transactions.js';
import { charmView, charmVerdict, frozenMeter, verdictLabel } from './pit-charm.js';
import { rivalQuotes } from '../tycoon/arcade-negotiation.js';
import { money, signed, rate, supplierNews, buyerMood, charmLosses, verdictOf, salePayoff, purchasePayoff,
  odds, stakePct, short, paperOf, stageName, earlyState, ventureOdds, outsideBid, whaleFacts, whaleOutlook, phaseName, newsEntry, fateOf, bestDeal } from './pit-ledger.js';
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
  const head = `<header class="plate-head"><span>${b.whale ? wide('FINAL', 'BID') : wide('THEIR', 'BID')}</span>${fuse(b.until, b.at, now)}</header>`;
  const funded = buyerLive(g, b) && Number.isSafeInteger(qty) && qty > 0 && qty <= b.qty - b.filled && cents(qty, b.rate) <= b.budget;
  if (!funded) return { valid: false, html: `${head}<strong class="plate-total money-hero">—</strong><small class="plate-sub negative">Choose up to ${Math.max(0, Math.min(b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))))} funded GPUs</small>` };
  const profit = d ? d.revenue - d.cost : null;
  // The whale's completion bonus is part of the total only when this sale completes its order.
  const bonus = b.whale && !b.whale.paid && b.filled + qty === b.qty ? b.whale.bonus : 0;
  const sub = `${rate(b.rate)}/h ×${qty} ${esc(b.gpu)}${bonus ? ` <b class="plate-bonus">+${money(bonus)} bonus</b>` : b.whale && !b.whale.paid ? `<span class="wide"> · bonus needs all ${b.qty - b.filled}</span>` : ''}`;
  return { valid: !!d, html: `${head}<strong class="plate-total money-hero" data-fx-quote data-fx-per="${cents(qty, 1)}">${money(cents(qty, b.rate) + bonus)}</strong><small class="plate-sub">${sub}</small>${d ? `<p class="plate-note ${profit >= 0 ? 'positive' : 'negative'}">${profit >= 0 ? signed(profit) : money(profit)} ${profit >= 0 ? 'profit' : 'loss'} if signed</p>` : stockNote(g, b, qty)}` };
}

// The company desk's live figures for a quantity: both payments side by side (exact, from
// deliveryQuote), the company's odds now and if you deliver, and the outside bid you forgo.
// Nothing is ranked or chosen for you; the select decides which payment you review.
const stockNote = (g, b, qty) => b.whale && Number.isSafeInteger(qty) && qty > owned(g, b.gpu) ? `<p class="plate-note negative">You own ${owned(g, b.gpu)} ${esc(b.gpu)}</p>` : '';

export function startupQuoteView(g, orderId, qty, payment) {
  const a = g.arcade, o = a.orders.find(o => o.id === orderId), s = o && g.startups.find(s => s.id === o.client);
  if (!o || !s?.alive || s.exited) return { valid: false, html: note('This company is no longer taking orders.', 'negative') };
  const left = remaining(o), stock = owned(g, o.gpu), whole = Number.isSafeInteger(qty) && qty > 0 && qty <= left;
  const n = whole ? qty : left, open = a.time < V7.seconds;
  const cashD = whole && open && deliveryQuote(g, o.id, qty, 'cash'), eqD = whole && open && deliveryQuote(g, o.id, qty, 'equity');
  const d = payment === 'equity' ? eqD : cashD;
  const why = !whole ? `Choose 1–${left}` : qty > stock ? `You own ${stock}` : '';
  const cashWhy = why || `${cashCapacity(g, o)} funded`;
  const opt = (kind, on, body) => `<p class="vd-opt ${on ? 'is-on' : ''} ${body ? '' : 'is-off'}"><span>${kind}</span>${body || `<b>—</b><small>${kind === 'CASH' ? cashWhy : why}</small>`}</p>`;
  const pay = `<div class="vd-pay">${opt('CASH', payment !== 'equity', cashD && `<b>${money(cashD.revenue)}</b><small>${cashD.revenue >= cashD.cost ? `${signed(cashD.revenue - cashD.cost)} profit` : `${money(cashD.cost - cashD.revenue)} loss`}</small>`)}${opt('EQUITY', payment === 'equity', eqD && `<b>+${pct(eqD.stake - s.stake)}</b><small>${money(eqD.value)} paper</small>`)}</div>`;
  const od = left ? ventureOdds(g, s, o, n) : null, now = od?.now || ventureOdds(g, s, o, 0).now;
  const ifLabel = od ? `IF ${n}${od.early ? ' EARLY' : ''}` : '';
  const oddsAria = `Odds this round: collapse ${odds(now.collapse)}${od ? `, ${odds(od.next.collapse)} if you deliver ${n}${od.early ? ' early' : ''}` : ''}; breakout ${odds(now.breakout)}${od ? `, ${odds(od.next.breakout)}` : ''}. Your stake never changes the odds.`;
  const oddsHTML = `<div class="vd-odds ${od ? '' : 'is-now-only'}" role="group" aria-label="${esc(oddsAria)}"><span class="vd-odds-h" aria-hidden="true">ODDS</span><span class="vd-odds-col" aria-hidden="true">NOW</span>${od ? `<span class="vd-odds-col is-if" aria-hidden="true">${ifLabel}</span>` : ''}` +
    `<span class="vd-odds-k is-bad" aria-hidden="true">Collapse</span><b aria-hidden="true">${odds(now.collapse)}</b>${od ? `<b class="is-if is-bad" aria-hidden="true">${odds(od.next.collapse)}</b>` : ''}` +
    `<span class="vd-odds-k is-good" aria-hidden="true">Breakout</span><b aria-hidden="true">${odds(now.breakout)}</b>${od ? `<b class="is-if is-good" aria-hidden="true">${odds(od.next.breakout)}</b>` : ''}</div>`;
  // Opportunity cost: the best funded outside bid for the GPUs you would hand over.
  const sellable = Math.min(n, stock), alt = sellable > 0 && outsideBid(g, o.gpu, sellable);
  const altHTML = !left ? '' : !stock ? `<p class="vd-alt is-none">You own no ${esc(o.gpu)}.</p>`
    : alt ? `<p class="vd-alt" aria-label="Or sell ${alt.qty} ${esc(o.gpu)} to ${esc(alt.buyer.name)} for ${money(alt.revenue)} now.">Or sell ${alt.qty}<span class="wide"> ${esc(o.gpu)}</span> to ${esc(alt.buyer.name)}${alt.buyer.whale ? ' (whale)' : ''}: <b>${money(alt.revenue)}</b><span class="wide"> now</span></p>`
    : `<p class="vd-alt is-none">No outside bid for ${esc(o.gpu)} right now.</p>`;
  // A VC bid is priced on today's stake: new equity voids it (arcade-vc.vcLive), so say so here.
  const bid = payment === 'equity' && a.vcOffers.find(v => v.client === s.id && vcLive(g, v));
  const void$ = bid ? `<p class="vd-alt is-warn">Equity voids ${esc(bid.name)}’s open bid.</p>` : '';
  return { valid: !!d, html: (left ? pay : '') + oddsHTML + altHTML + void$ };
}

export function secondaryQuoteView(g, bps) {
  const d = secondaryQuote(g, g.arcade.confirm?.vcId, bps), s = d && g.startups.find(s => s.id === d.client);
  if (!d) return { valid: false, html: `<p class="vc-math is-off">${note('Choose a share of your stake within this bid’s budget.', 'negative')}</p>` };
  return { valid: true, html: `<div class="vc-math"><p class="vc-cash"><span>Cash now</span><b>${money(d.proceeds)}</b></p><p><span>You keep</span><b>${pct(d.remaining)}</b><small>${money(Math.floor(d.remaining * s.val * 100))} paper</small></p></div>` };
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

// The whale's desk: a premium, funded, final bid. Progress, the bonus rule, the deadline and
// what you own of its GPU. No counters; sell what you have or go find supply.
function whaleView(g, ui, b) {
  const a = g.arcade, f = whaleFacts(g, b), stock = owned(g, b.gpu), now = a.time;
  const qty = ui.qty ?? Math.max(1, Math.min(stock || f.left, f.left)), quote = buyerQuoteView(g, Number(qty));
  const line = f.paid ? 'Delivered in full. Pleasure.' : f.filled ? `${f.left} more ${b.gpu}, then the bonus.` : `${f.qty} ${b.gpu} by second ${b.until}. Premium.`;
  const who = identity(b.name, 'buyer', `The whale · ${f.premium}× market`, line, 'Final bid', f.paid ? 'pleased' : 'eager');
  const filledPct = Math.round(f.filled / f.qty * 100);
  return { title: 'The whale', role: 'buyer', tone: 'negotiation', identity: who, desk: 'whale',
    body: `<div class="face-off whale-face"><section class="plate their whale-plate" data-fx-board aria-label="Their final bid"><div data-sale-math>${quote.html}</div></section>` +
      `<section class="whale-terms mat-paper" aria-label="The whale's terms"><p class="whale-row"><span>Rate</span><b>${rate(b.rate)}/h</b><small>${f.premium}× the ${rate(f.market)} market<span class="wide"> · Clout ${f.clout}</span></small></p>` +
      `<div class="whale-progress" role="progressbar" aria-label="Filled" aria-valuemin="0" aria-valuemax="${f.qty}" aria-valuenow="${f.filled}"><span style="width:${filledPct}%"></span><b>${f.filled}/${f.qty} filled</b></div>` +
      `<p class="whale-row whale-bonus ${f.paid ? 'is-paid' : ''}"><span>Bonus</span><b>+${money(f.bonus)}</b><small>${f.paid ? 'paid' : `only on the sale that completes ${f.qty}`}</small></p>` +
      `<p class="whale-row whale-own"><span>You own</span><b>${stock} ${esc(b.gpu)}</b><label class="qty-chip">Sell ${input('data-sale-qty', qty, 1, f.left, 1, 'GPUs to sell to the whale')}</label></p></section></div>`,
    footer: `<span data-buyer-actions>${buyerActions(g, Number(qty))}</span>` };
}

function buyerView(g, ui) {
  const a = g.arcade, b = a.buyers.find(b => b.id === a.confirm.buyerId), n = b.negotiation, live = buyerLive(g, b), wanted = b.qty - b.filled, now = a.time;
  if (b.whale && live && !ui.buyerSources) return whaleView(g, ui, b);
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
  if (sale) return button('buyer-sources', b.whale ? 'Find supply' : 'Source more', 'class="mat-exit rail-quiet"') + vault('sell-buyer', `SELL ${qty}`, money(sale.revenue), `aria-label="Sell ${qty} ${esc(b.gpu)} for ${money(sale.revenue)}${sale.bonus ? `, including the ${money(sale.bonus)} completion bonus` : ''}: review the contract"`);
  return vault('buyer-sources', b.whale ? `FIND ${esc(b.gpu)} SUPPLY` : `SOURCE ${want} ${esc(b.gpu)}`, '', `aria-label="Find ${want} ${esc(b.gpu)} from suppliers on the floor"`);
}

const paper = html => `<div class="desk-center"><div class="paper-sheet mat-paper">${html}</div></div>`;
const stampLine = (action, label, attrs = '') => `<div class="sign-line">${button(action, label, `class="mat-stamp is-lit" data-primary ${attrs}`)}<span class="sig-rule" aria-hidden="true">x</span></div>`;
const paperHead = (left, right) => `<header class="contract-head"><span>${left}</span><span>${right}</span></header>`;

function contractView(g, d) {
  const purchase = d.kind === 'purchase', secondary = d.kind === 'secondary', mandate = d.kind === 'mandate';
  let terms, sub;
  if (purchase) { terms = `BUY ${d.qty} ${esc(d.gpu)} from ${esc(d.counterparty)}`; sub = `${rate(d.rate)}/h · ${d.savings > 0 ? `${money(d.savings)} under their opening ask` : 'at their opening ask'}`; }
  else if (secondary) { const q = secondaryQuote(g, g.arcade.confirm?.vcId, d.bps); terms = `TRANSFER ${d.qty.toFixed(3)}% ${esc(d.gpu.replace(/^% of /, 'of '))}`; sub = q ? `Historical basis ${money(q.basis)} · gain ${money(q.gain)}` : 'Cash on signature'; }
  else { const p = d.total - d.cost, bonus = d.kind === 'buyer' ? d.total - cents(d.qty, d.rate) : 0; terms = `${mandate ? 'DELIVER' : 'SELL'} ${d.qty} ${esc(d.gpu)} to ${esc(d.counterparty)}`; sub = `${bonus > 0 ? `incl. ${money(bonus)} bonus · ` : ''}FIFO cost ${money(d.cost)} · realizes ${p >= 0 ? signed(p) : money(p)}`; }
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

// After a startup delivery: the company's odds as they stand now (support counted, stake not).
function oddsNow(g, d, flag = true) {
  const o = g.arcade.orders.find(o => o.id === d.orderId), s = o && g.startups.find(s => s.id === o.client);
  if (!o || !s?.alive || s.exited) return '';
  const now = ventureOdds(g, s, o, 0).now;
  return `<p class="vd-odds-line" aria-label="${esc(s.name)} this round: collapse ${odds(now.collapse)}, breakout ${odds(now.breakout)}."><span>Collapse <b class="is-bad">${odds(now.collapse)}</b></span><span>Breakout <b class="is-good">${odds(now.breakout)}</b></span>${flag && o.earlyMet ? '<span class="vd-flag is-done">EARLY</span>' : ''}</p>`;
}

// A completed company order is a milestone: say it once, on the receipt that completed it.
function milestoneOf(g, d) {
  const o = g.arcade.orders.find(o => o.id === d.orderId);
  if (!o || remaining(o) || g.arcade.receipts.filter(r => r.orderId === o.id).at(-1)?.id !== d.id) return '';
  return `<p class="payoff-milestone">ORDER COMPLETE${o.earlyMet ? ' · EARLY' : ''} <small>Clout +40</small></p>`;
}

function receiptView(g, d) {
  const purchase = d.kind === 'purchase', equity = d.kind === 'startup' && d.payment === 'equity', secondary = d.kind === 'secondary', startupCash = d.kind === 'startup' && !equity;
  const role = purchase ? 'seller' : secondary ? 'capital' : d.kind === 'startup' ? 'startup' : 'buyer';
  let payoff, fine = '', milestone = equity ? milestoneOf(g, d) : '';
  if (purchase) {
    const p = purchasePayoff(d), tokens = `<span class="gpu-chips" aria-hidden="true">${`<i class="gpu-chip gpu-${esc(String(d.gpu).toLowerCase())}"></i>`.repeat(Math.min(8, p.qty))}</span>`;
    payoff = `<div class="payoff payoff-stock" data-fx-payoff>${tokens}<strong class="payoff-hero">${p.qty} ${esc(p.gpu)} into your book</strong><p class="payoff-sub">Paid ${money(p.paid)} · ${p.savings > 0 ? `${money(p.savings)} under their opening ask` : 'at their opening ask'}</p></div>`;
    fine = `<p class="payoff-fine">Realized profit $0 until you sell or deliver · expires at the bell</p>`;
  } else if (equity) {
    payoff = `<div class="payoff payoff-equity" data-fx-payoff>${hero('Ownership received', `+${pct(d.equityReceived ?? (d.stake - g.startups.find(s => s.id === g.arcade.orders.find(o => o.id === d.orderId)?.client)?.stake))}`, `Stake now ${pct(d.ownershipAfter ?? d.stake)} · ${money(d.value)} paper, not cash`)}${metrics(metric('Cash received', '$0'), metric('Compute expensed', money(d.cost), 'negative'))}${oddsNow(g, d, !milestone)}</div>`;
    fine = `<p class="payoff-fine wide">Pays only through a VC sale, an exit or the bell desk at 30%.</p>`;
  } else if (secondary) {
    const sale = [...g.arcade.secondarySales].reverse().find(s => s.q === d.q && s.counterparty === d.counterparty && s.proceeds === d.total);
    payoff = `<div class="payoff payoff-cash" data-fx-payoff>${hero('Cash received', money(d.total), `${d.qty.toFixed(3)}% company ownership transferred`)}${metrics(metric('Historical basis allocated', money(sale?.basis || 0)), metric('Economic gain / loss', money(d.total - (sale?.basis || 0))))}</div>`;
    fine = `<p class="payoff-fine">Retained ownership ${pct(sale?.remaining || 0)}. Compute cost was expensed earlier; game profit rises by ${money(d.total)} without charging it twice.</p>`;
  } else {
    // Sales, Atlas and startup cash deliveries realize revenue − FIFO cost, win or lose.
    const s = salePayoff(d), cls = s.win ? 'win' : 'loss';
    milestone = startupCash ? milestoneOf(g, d) : '';
    payoff = `<div class="payoff payoff-${cls}" data-fx-payoff><span class="payoff-label">Realized profit</span><strong class="payoff-hero money-hero ${cls}">${s.profit >= 0 ? signed(s.profit) : money(s.profit)}</strong><p class="payoff-sub">${startupCash ? `Cash received ${money(s.revenue)}` : `${money(s.revenue)} revenue`} − ${money(s.cost)} FIFO cost basis</p>${d.kind === 'buyer' && d.total > cents(d.qty, d.rate) ? `<p class="payoff-bonus">WHALE BONUS +${money(d.total - cents(d.qty, d.rate))}</p>` : ''}<div class="spread-bar ${cls}" aria-hidden="true"><span class="bar-base" style="width:${s.base}%"></span><span class="bar-tail" style="width:${s.tail}%"></span></div><p class="spread-ends"><span>COST ${rate(Math.round(s.costRate))}/h</span><span>SOLD ${rate(s.soldRate)}/h</span></p>${startupCash ? oddsNow(g, d, !milestone) : ''}</div>`;
  }
  const title = purchase ? 'Inventory secured.' : equity ? 'Shares received' : 'Deal on the tape.';
  return { title, role, tone: 'receipt', desk: 'receipt', exit: null,
    identity: identity(d.counterparty, role, `${d.qty} ${String(d.gpu).startsWith('%') ? 'ownership' : esc(d.gpu)} · signed`, purchase ? 'Your compute. Your next move.' : equity ? 'Now we build something.' : 'Good doing business.', '', 'pleased'),
    body: `<div class="desk-center"><article class="receipt mat-paper is-signed">${paperHead(`HSC · ${esc(d.id)}`, `<span class="wide">${esc(d.counterparty)}</span>`)}<strong class="deal-stamp" data-fx-stamp>SIGNED</strong>${milestone}${payoff}${fine}</article></div>`,
    footer: receiptRail(g, d) };
}

const STAGES = ['Seed', 'Product', 'Growth', 'Scale', 'Frontier'];
function companyCard(g, s) {
  const st = Math.max(0, Math.min(4, Math.floor(s.v104.stage))), paper = paperOf(s), vc = g.arcade.vcOffers.find(v => v.client === s.id && vcLive(g, v));
  const track = `<ol class="vd-stages" aria-label="Stage ${STAGES[st]} of five">${STAGES.map((n, i) => `<li class="${i < st ? 'is-past' : i === st ? 'is-now' : ''}"><span>${i === st ? n : ''}</span></li>`).join('')}</ol>`;
  return `<section class="vd-company mat-paper" aria-label="${esc(s.name)}">${paperHead(esc(s.sector), `<span class="wide">Since </span>R${s.v104.born}`)}${track}` +
    `<dl class="vd-figs"><div><dt>Valuation</dt><dd>${short(Math.round(s.val * 100))}</dd></div><div><dt>Your stake</dt><dd>${s.stake > 0 ? stakePct(s.stake) : 'None'}</dd></div>` +
    `<div class="vd-paper"><dt>Paper (not cash)</dt><dd>${money(paper)}</dd></div></dl>` +
    `<p class="vd-track"><span>Track</span><span class="fate-trail" aria-label="${s.v104.events.length ? s.v104.events.map(e => e.kind).join(', ') : 'No rounds settled yet'}">${s.v104.events.map(e => `<i class="ev-${e.kind}"></i>`).join('') || '<em>new this round</em>'}</span>${paper ? `<span class="vd-bell">bell desk ${money(Math.floor(paper * .3))}</span>` : ''}</p>` +
    (vc ? button('review-vc', `VC bid · ${short(vc.bidVal)} val`, `data-id="${esc(vc.id)}" class="vd-vc mat-exit" aria-label="Review ${esc(vc.name)}'s bid for your ${esc(s.name)} shares"`) : '') + '</section>';
}

function startupView(g, ui) {
  const a = g.arcade, o = a.orders.find(o => o.id === ui.orderId) || a.orders.find(o => o.client === a.anchor) || a.orders[0], s = g.startups.find(s => s.id === o.client);
  const left = remaining(o), stock = owned(g, o.gpu), e = earlyState(g, o);
  const qty = ui.qty ?? (left ? Math.max(1, Math.min(stock || left, left)) : 1), payment = ui.payment || 'cash';
  const q = startupQuoteView(g, o.id, Number(qty), payment);
  const early = !left ? '<span class="vd-flag is-done">FILLED</span>' : e.kind === 'met' ? '<span class="vd-flag is-done">EARLY</span>' : e.kind === 'open' ? `<span class="vd-early" aria-label="Early credit if the whole order lands before second ${e.at}">EARLY ${fuse(e.at, 0, a.time)}</span>` : '<span class="vd-early is-late">early window closed</span>';
  const line = o.milestone ? 'That moves our odds.' : e.kind === 'open' ? (s.stake > 0 ? 'Partner, we need compute.' : 'Back us early. It counts.') : 'We still need compute.';
  const deal = `<section class="vd-deal mat-paper" data-order="${esc(o.id)}">${paperHead(`Order R${g.q}`, `${o.delivered}/${o.qty} in`)}<p class="vd-need"><b>${left || o.qty} ${esc(o.gpu)}</b><span class="vd-rate">${rate(o.rate)}/h</span>${early}</p>` +
    (left ? `<div class="deal-field-row vd-fields"><label>GPUs${input('data-order-qty', qty, 1, left, 1, 'GPUs to deliver')}</label><label>Pay<select data-payment aria-label="Payment"><option value="cash" ${payment === 'cash' ? 'selected' : ''}>Cash</option><option value="equity" ${payment === 'equity' ? 'selected' : ''}>Equity</option></select></label></div>` : '') +
    `<div data-order-preview>${q.html}</div>` +
    (left && stock < left ? button('open-market', `Find ${o.gpu}`, `data-filter="seller" data-gpu="${o.gpu}" class="vd-find mat-exit" aria-label="Find ${o.gpu} suppliers on the floor"`) : '') + '</section>';
  return { title: 'The founder’s desk', role: 'startup', desk: 'venture', identity: identity(s.name, 'startup', s.sector, line, '', o.milestone ? 'pleased' : 'eager'),
    body: `<div class="desk-center"><div class="venture-desk">${companyCard(g, s)}${deal}</div></div>`,
    footer: rail(`${stock} ${o.gpu} in your book`, 'wide-only') + (left ? vault('prepare', 'Review delivery', '', `data-id="${esc(o.id)}" ${q.valid ? '' : 'disabled'}`) : moveOn('close-focus', 'Back to the floor')) };
}

// Delivery is conclusive, so it is stamped on the paper, away from the rail spot that opened it.
function deliveryView(g) {
  const c = g.arcade.confirm, d = g.arcade.time < V7.seconds && deliveryQuote(g, c.orderId, c.qty, c.payment), o = g.arcade.orders.find(o => o.id === c.orderId);
  if (!d) return { title: 'Delivery unavailable', role: 'startup', desk: 'paper', exit: null, body: paper(note('Inventory or startup funding changed. Review the order again.')), footer: close() };
  const s = g.startups.find(s => s.id === o.client), od = ventureOdds(g, s, o, d.qty), equity = d.payment === 'equity';
  const oddsLine = `<p class="vd-odds-line" aria-label="Collapse ${odds(od.now.collapse)} now, ${odds(od.next.collapse)} after. Breakout ${odds(od.now.breakout)} now, ${odds(od.next.breakout)} after."><span>Collapse <s>${odds(od.now.collapse)}</s> <b class="is-bad">${odds(od.next.collapse)}</b></span><span>Breakout <s>${odds(od.now.breakout)}</s> <b class="is-good">${odds(od.next.breakout)}</b></span>${od.early ? '<span class="vd-flag is-done">EARLY</span>' : ''}</p>`;
  return { title: equity ? 'Take the upside' : 'Deliver for cash', role: 'startup', desk: 'contract',
    identity: identity(o.name, 'startup', `${d.qty} ${o.gpu} · ${equity ? 'for shares' : 'for cash'}`, equity ? 'Partners, then.' : 'Cash on delivery.', '', 'eager'),
    body: `<div class="desk-center"><article class="contract mat-paper" data-fx-contract>${paperHead('HSC · DELIVERY', equity ? 'EQUITY' : 'CASH')}<p class="contract-terms">DELIVER ${d.qty} ${esc(o.gpu)} TO ${esc(o.name.toUpperCase())}</p>` +
      `<strong class="contract-total money-hero">${equity ? `+${pct(d.stake - s.stake)}` : money(d.revenue)}</strong>` +
      `<p class="contract-sub">${equity ? `Stake ${pct(s.stake)} → ${pct(d.stake)}<span class="wide"> ·</span> cost ${money(d.cost)}` : `FIFO cost ${money(d.cost)} · realizes ${d.revenue - d.cost >= 0 ? signed(d.revenue - d.cost) : money(d.revenue - d.cost)}`}</p>${oddsLine}` +
      `${stampLine('deliver', equity ? 'SIGN · TAKE SHARES' : `SIGN · RECEIVE ${money(d.revenue)}`)}<p class="contract-fine">${equity ? 'Not cash: shares pay via a VC sale, an exit or the bell desk (30%).' : 'Cash and stock change together when you sign.'}</p></article></div>`,
    footer: button('review-order', 'Change it', 'class="mat-exit rail-quiet" aria-label="Change the quantity or payment"') + rail(equity ? 'No cash moves' : `Cash after ${money(cash(g) + d.revenue)}`, 'wide-only') };
}

function stockView(g) {
  const stock = g.arcade.inventory.filter(x => x.left), types = [...new Set(stock.map(x => x.gpu))];
  const mandate = mandateQuote(g);
  return { title: 'Your compute book', role: 'stock', desk: 'paper', exit: null, body: paper(hero('Unexpired inventory at cost', money(inventoryCost(g)), `${stock.reduce((n, x) => n + x.left, 0)} prepaid GPUs · expire at the bell`) +
    (types.map(gpu => `<article class="deal-stock-row"><div><b>${owned(g, gpu)} ${gpu}</b><span>${money(stock.filter(x => x.gpu === gpu).reduce((n, x) => n + x.left * x.unitCost, 0))} basis</span></div>${button('open-market', 'Find buyers', `data-filter="buyer" data-gpu="${gpu}" class="mat-exit"`)}${g.arcade.orders.filter(o => o.gpu === gpu && remaining(o)).map(o => button('focus-order', esc(o.name), `data-id="${esc(o.id)}" class="mat-exit"`)).join('')}</article>`).join('') || note('Your book is empty. Choose a buyer, then source matching compute.')) +
    (mandate && owned(g, mandate.gpu) ? button('open-panel', `Atlas procurement · ${mandate.secured}/${mandate.qty} secured`, 'data-panel="mandate" class="deal-inline-action mat-exit"') : '') +
    (stock.length ? contractDetails(`<p>Rights expire at the round’s bell. Undelivered cost becomes a realized loss.</p>${stock.map(x => `<p>${esc(x.firm)} · ${x.left}/${x.qty} ${x.gpu} remaining · ${money(x.left * x.unitCost)} basis.</p>`).join('')}`) : '')), footer: close() };
}

// The VC desk: their valuation against the mark, their budget, how much of your stake it can
// buy and the exact cash it pays now. Selling part is a preset tap or a typed percentage.
function capitalView(g, ui) {
  const a = g.arcade, id = a.confirm?.vcId;
  if (id) {
    const b = a.vcOffers.find(b => b.id === id), s = g.startups.find(s => s.id === b.client), max = maxSaleBps(b), cap = max / 100;
    const percent = ui.vcPercent ?? Math.min(25, cap).toFixed(2), q = secondaryQuoteView(g, Math.round(Number(percent) * 100));
    const mark = Math.round(s.val * 100), ratio = b.bidVal / mark, all = secondaryQuote(g, id, max);
    const presets = [...new Set([25, 50, 100].map(p => Math.min(p * 100, max)))].filter(v => v > 0).map(v => button('vc-preset', v === max && v < 10000 ? `Max ${(v / 100).toFixed(v % 100 ? 2 : 0)}%` : `${v / 100}%`, `class="vc-preset mat-key" data-value="${(v / 100).toFixed(2)}" aria-label="Sell ${(v / 100).toFixed(2)} percent of your stake"`)).join('');
    return { title: 'VC desk', role: 'capital', desk: 'vc', identity: identity(b.name, 'capital', `${b.type} · ${s.name}`, ratio >= 1 ? 'A premium for your shares. Today only.' : 'Cash now, for some of your upside.', b.type === 'Strategic buyer' ? 'Strategic bid' : '', 'eager'),
      body: `<div class="desk-center"><div class="vc-desk"><section class="vc-terms mat-paper">${paperHead(`Bid · ${esc(s.name)}`, `${Math.max(0, Math.ceil(b.until - a.time))}s left`)}` +
        `<div class="vc-vals"><p><span>Their valuation</span><b>${short(b.bidVal)}</b></p><p class="vc-ratio ${ratio >= 1 ? 'is-premium' : ''}"><b>${Math.round(ratio * 100)}%</b><span>of mark</span></p><p><span>Mark</span><b>${short(mark)}</b></p></div>` +
        `<dl class="vc-figs"><div><dt>Budget</dt><dd>${money(b.budget)}</dd></div><div><dt>Your stake</dt><dd>${pct(s.stake)}</dd></div><div><dt>They can buy</dt><dd>${cap >= 100 ? 'All of it' : `${cap.toFixed(2)}%`}</dd></div></dl></section>` +
        `<section class="vc-sell mat-paper">${paperHead('Sell', all ? `max ${money(all.proceeds)}` : '')}<div class="vc-presets">${presets}</div>` +
        `<label class="vc-pct"><span>% of your stake</span>${input('data-vc-percent', percent, 0.01, cap.toFixed(2), 0.01, 'Percent of your stake to sell')}</label><div data-vc-math>${q.html}</div></section></div></div>`,
      footer: rail('One acceptance per bid', 'wide-only') + vault('sell-vc', 'Review sale', '', q.valid ? '' : 'disabled') };
  }
  const bids = a.vcOffers.filter(b => vcLive(g, b)), held = g.startups.filter(s => s.alive && !s.exited && s.stake > 0);
  const bidCard = b => { const s = g.startups.find(s => s.id === b.client), mark = Math.round(s.val * 100), all = secondaryQuote(g, b.id, maxSaleBps(b));
    return `<article class="deal-list-card"><div><b>${esc(s.name)} · ${Math.round(b.bidVal / mark * 100)}% of mark</b><span>${esc(b.name)} · up to ${all ? money(all.proceeds) : money(b.budget)} cash</span></div>${button('review-vc', 'Review bid', `data-id="${esc(b.id)}" class="mat-exit"`)}</article>`; };
  const stakeRow = s => `<article class="deal-list-card vc-hold"><div><b>${esc(s.name)} · ${stakePct(s.stake)}</b><span>${money(paperOf(s))} paper · bell desk ${money(Math.floor(paperOf(s) * .3))}</span></div></article>`;
  return { title: 'The capital office', role: 'capital', desk: 'paper', exit: null, body: paper(`${paperHead('VC bids', `${bids.length} open`)}${bids.map(bidCard).join('') || note('No bids on the board. VCs bid the round after a company grows.')}` +
    (held.length ? `${paperHead('Your stakes', 'paper, not cash')}${held.map(stakeRow).join('')}` : note('Deliver compute for equity to own a stake.'))), footer: close() };
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

// What the score would be if the bell rang now: cash + stock at cost + live stakes at the
// closing desk's 30% (wealth.fortune). Stock is counted at cost; unsold, it expires at the bell.
function fortuneBody(g) {
  const w = fortune(g), L = g.arcade.score, realized = L.trading - L.equityCost + L.exits + L.secondary + L.closing - L.expired;
  return hero('If the bell rang now', money(w.netWorth), `Started with ${money(V7.cash)} · realized so far ${signed(realized)}`) +
    metrics(metric('Cash', money(w.cash)), metric('Stock at cost', money(w.inventory), w.inventory ? 'negative' : ''), metric('Stakes at the bell desk (30%)', money(w.equity)), metric('Stakes on paper (not cash)', money(w.holdings.reduce((n, h) => n + h.paper, 0)))) +
    (w.inventory ? note('Your stock counts at cost here, but unsold stock expires at the bell: sell or deliver it first.', 'negative') : '') +
    (w.holdings.length ? `<div class="deal-round-orders">${w.holdings.map(h => note(`<b>${esc(h.name)}</b> · ${money(h.paper)} paper × 30% = ${money(h.value)}`)).join('')}</div>` : '');
}

const moveOn = (action, label) => button(action, `${label} <span aria-hidden="true">→</span>`, 'class="mat-move rail-commit" data-primary');

// ---- Round news: one punchy page per bell, straight from the settlement lines -------------
const DRAMA = { ipo: 0, acquired: 1, breakout: 2, collapse: 3, growth: 4, stall: 5, flat: 6 };
function newsItem(n) {
  const x = n.multiple ? `×${n.multiple.toFixed(2)}` : '';
  const stamp = { ipo: 'IPO', acquired: 'ACQUIRED', breakout: 'BREAKOUT', growth: 'GROWTH', flat: 'FLAT', stall: 'STALL', collapse: 'COLLAPSED' }[n.kind];
  const backed = n.backed ? `<span class="news-backed ${n.backed.delivered >= n.backed.qty ? 'is-full' : n.backed.delivered ? '' : 'is-none'}" aria-label="You delivered ${n.backed.delivered} of ${n.backed.qty}${n.backed.early ? ', early' : ''}">${n.backed.delivered}/${n.backed.qty}${n.backed.early ? ' early' : ''}</span>` : '';
  let you;
  if (n.exit) you = n.exit.proceeds > 0 ? `<b class="news-cash">+${money(n.exit.proceeds)} cash</b> for your ${stakePct(n.exit.stake)}` : 'You held no stake.';
  else if (n.kind === 'collapse') you = n.lostStake > 0 ? `Your ${stakePct(n.lostStake)} is gone <s>${money(n.paperBefore)}</s>` : 'You held no stake.';
  else if (n.stakeAfter > 0) you = `Your ${stakePct(n.stakeAfter)}: <b>${money(n.paperAfter)}</b> paper${n.raise ? ' <span class="wide">(diluted)</span>' : ''}`;
  else you = 'You hold no stake.';
  const moment = n.moment ? `<strong class="news-moment" aria-label="${Math.floor(n.x)} times the compute you put in">${Math.floor(n.x)}× YOUR COMPUTE</strong>` : '';
  const val = n.kind === 'collapse' ? '' : `<span class="news-val">${short(n.valBefore)} → <b>${short(n.exit ? Math.round(n.exit.price * 100) : n.valAfter)}</b></span>`;
  return `<li class="news-item kind-${n.kind} ${n.moment ? 'is-moment' : ''}"><strong class="news-stamp">${stamp}${x && !n.exit && n.kind !== 'collapse' ? ` <i>${x}</i>` : ''}</strong><div class="news-copy"><b class="news-name">${esc(n.name)}</b>${val}${backed}<p class="news-you">${you}</p></div>${moment}</li>`;
}

function newsView(g) {
  const a = g.arcade, r = a.history.at(-1), items = (a.ventureNews || []).map(l => newsEntry(g, l, r.orders)).sort((x, y) => DRAMA[x.kind] - DRAMA[y.kind]);
  // This round's deliveries are still on the books until the next round opens.
  const pnl = Math.round(r.profit * 100), whale = whaleOutlook(g), equity = a.deliveries.filter(d => d.payment === 'equity').reduce((n, d) => n + d.cost, 0);
  const lead = items.find(n => n.moment) || items.find(n => n.exit && n.exit.proceeds > 0) || items.find(n => n.kind === 'breakout') || items.find(n => n.kind === 'collapse' && n.lostStake > 0);
  const tone = lead ? (lead.kind === 'collapse' ? 'is-grim' : 'is-boom') : '';
  return { title: `Round ${r.q} · books closed`, role: 'report', desk: 'news', exit: null,
    body: `<div class="desk-center"><article class="news-sheet mat-paper ${tone}"><header class="news-mast"><span>THE HSC TAPE</span><b>ROUND ${r.q} NEWS</b></header>` +
      `<p class="news-pnl"><span>Round P&amp;L</span><b class="${pnl >= 0 ? 'pos' : 'neg'}">${signed(pnl)}</b>${r.lost ? `<small>expired stock ${money(-r.lost)}</small>` : ''}${equity ? `<small class="news-equity">incl. ${money(equity)} of compute paid in shares</small>` : ''}</p>` +
      (items.length ? `<ol class="news-items">${items.map(newsItem).join('')}</ol>` : '<p class="news-quiet">No companies on the floor this round.</p>') +
      `<p class="news-next"><span>Next</span><b>R${g.q} · ${esc(phaseName(g.q))}</b>${whale?.next ? '<em class="news-whale">A whale is coming</em>' : ''}</p>${whale ? `<p class="news-clout"><span>${whale.next ? 'Its premium' : 'Whale due R7–8'}</span>Clout <b>${whale.clout}</b> earns <b>${whale.premium}×</b>${whale.tier ? `<small>${whale.tier.clout} for ${whale.tier.premium}× · sales +5, first buy per firm +4, filled orders +40</small>` : '<small>top tier</small>'}</p>` : ''}</article></div>`,
    footer: button('restart-review', 'New run', 'class="mat-exit rail-quiet"') + moveOn('next', `Open round ${g.q}<span class="wide"> / ${V7.rounds}</span>`) };
}

// ---- The final books: realized cash only, every category once ----------------------------
function fateLine(f) {
  const trail = `<span class="fate-trail" aria-hidden="true">${f.events.map(e => `<i class="ev-${e.exit || e.kind}"></i>`).join('')}</span>`;
  const text = f.kind === 'collapse' ? `collapsed R${f.round}` : f.kind === 'ipo' ? `IPO R${f.round}${f.proceeds ? ` <b>+${money(f.proceeds)}</b>` : ''}` : f.kind === 'acquired' ? `acquired R${f.round}${f.proceeds ? ` <b>+${money(f.proceeds)}</b>` : ''}`
    : f.kind === 'closing' ? `bell desk <b>+${money(f.proceeds)}</b><span class="wide"> for ${stakePct(f.stake)} (30% of ${short(f.mark)})</span>` : 'private, no stake';
  return `<li class="fate fate-${f.kind}"><b>${esc(f.name)}</b>${trail}<span>${text}</span></li>`;
}

function finalView(g, ui = {}) {
  const a = g.arcade, f = a.finalScore, L = a.score, done = a.ending === 'completed', delta = f.cash - f.start;
  const rows = [['Trading', L.trading], ['Equity compute', -L.equityCost], ['Exits', L.exits], ['VC sales', L.secondary], ['Bell desk 30%', L.closing], ['Expired stock', -L.expired]];
  const best = bestDeal(L.best), fates = g.startups.map(s => fateOf(g, s));
  const shared = ui.shared ? `<div class="final-shared"><textarea readonly rows="3" aria-label="Challenge text to copy">${esc(ui.shared.text)}</textarea><small role="status">${ui.shared.status === 'copied' ? 'Copied to your clipboard' : ui.shared.status === 'shared' ? 'Shared' : 'Select the text to copy it'}</small></div>` : '';
  return { title: done ? 'The closing bell' : 'The desk closes early', role: 'report', desk: 'final', exit: null,
    body: `<div class="desk-center"><article class="final-sheet mat-paper ${delta >= 0 ? 'is-up' : 'is-down'} ${done ? '' : 'is-insolvent'}">${paperHead(`<span class="wide">HSC · </span>FINAL BOOKS · SEED ${g.seed}`, `${f.rounds}/${V7.rounds}<span class="wide"> rounds settled</span>`)}` +
      `<p class="final-label">${done ? 'Final cash' : `Out of cash · round ${f.rounds}`}</p><strong class="final-cash money-hero" style="--chars:${money(f.cash).length}" data-fx-payoff>${money(f.cash)}</strong>` +
      `<p class="final-vs"><b>${(f.cash / f.start).toFixed(2)}×</b><span>your ${money(f.start)}</span><b class="${delta >= 0 ? 'pos' : 'neg'}">${signed(delta)}</b></p>` + personalBest(g, ui.best) +
      (done ? '' : `<p class="final-note">BUST. No shares left, and the next round’s cheapest lot costs more than your cash, even at its floor. The desk closed after round ${f.rounds}.</p>`) +
      `<dl class="final-break">${rows.map(([k, v]) => `<div class="${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}"><dt>${k}</dt><dd>${v ? signed(v) : '$0'}</dd></div>`).join('')}</dl>` +
      (best ? `<p class="final-best"><span>Best deal</span> R${best.round} · ${esc(best.what)} <b>+${money(best.amount)}</b></p>` : '') +
      `<ul class="final-fates">${fates.map(fateLine).join('')}</ul>` +
      `<div class="final-share-row">${button('share-score', 'Challenge a friend', 'class="mat-exit final-share" aria-label="Share your final cash with a link to this exact market"')}${shared}</div></article></div>`,
    footer: button('replay-seed', `Replay seed ${esc(String(g.seed))}`, `class="mat-exit rail-quiet" data-seed="${esc(String(g.seed))}" aria-label="Replay this exact market, seed ${esc(String(g.seed))}"`) + button('new-market', `Play again <span aria-hidden="true">→</span>`, 'class="mat-move rail-commit" data-primary aria-label="Play again on a fresh market"') };
}

// Local best only (this browser, this version): never a leaderboard.
function personalBest(g, best) {
  if (!best) return '';
  const f = g.arcade.finalScore, mine = best.cash === f.cash && best.seed === g.seed;
  return mine ? `<p class="final-pb is-new"><b>NEW PERSONAL BEST</b>${best.prev != null ? `<span>beat ${money(best.prev)}</span>` : '<span>first run on this device</span>'}</p>`
    : `<p class="final-pb"><span>Your best</span><b>${money(best.cash)}</b><span>seed ${esc(String(best.seed))}</span></p>`;
}

function reportView(g, ui) { return g.phase === 'over' ? finalView(g, ui) : newsView(g); }

// Before the bell: what expires, and each company's odds as your support stands right now.
function bellView(g) {
  const a = g.arcade, lost = inventoryCost(g), last = g.q >= V7.rounds;
  const rows = g.startups.filter(s => s.alive && !s.exited).map(s => { const o = a.orders.find(o => o.client === s.id); if (!o) return '';
    const now = ventureOdds(g, s, o, 0).now;
    return `<li><b>${esc(s.name)}</b><span>${o.delivered}/${o.qty}${o.earlyMet ? ' early' : ''}</span><span class="is-bad">${odds(now.collapse)} collapse</span><span class="is-good">${odds(now.breakout)} breakout</span></li>`; }).join('');
  return { title: last ? 'Ring the final bell?' : 'Ring the bell?', role: 'report', desk: 'paper', exit: null,
    body: paper(hero(lost ? 'Unsold stock expires' : 'Nothing expires', money(lost), lost ? 'Its full cost becomes a realized loss.' : 'Your book is empty.') +
      (rows ? `<ul class="bell-odds" aria-label="Company odds at this bell">${rows}</ul>` : '') +
      (last ? note('The closing desk then buys every live stake at 30% of its mark.') : '') + stampLine('finish', last ? 'RING THE FINAL BELL' : 'SETTLE THIS ROUND')), footer: close('Keep trading') };
}

export function dealView(g, ui = {}) {
  const a = g.arcade, c = a.confirm;
  // Irreversible confirmations are stamped on the paper, never on the rail spot that opened them.
  if (c?.restart) return { title: 'Start a fresh broker run?', role: 'report', desk: 'paper', exit: null, body: paper(note('This replaces your current V10.4 run. Its cash, deals and campaign progress will be reset.') + stampLine('restart', 'START FRESH')), footer: close('Keep this run') };
  if (g.phase !== 'floor') return reportView(g, ui);
  if (a.signing) return contractView(g, a.signing);
  if (c?.receipt) return receiptView(g, c.receipt);
  if (c?.finish) return bellView(g);
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
