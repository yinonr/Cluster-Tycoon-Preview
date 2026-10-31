import { resultLabel, resultRounds, resultAmounts } from './results.js';
import { campaignLimit, qualification } from '../tycoon/extension.js';
import { taskDeck } from '../tycoon/task-navigation.js';
import { brokerOffer } from './broker-offer.js';
import { scorecardDataUrl, shareCopy } from './scorecard.js';
import { pilotResultLine } from './pit-ledger.js';
import { mini, BROKER_SHAPES } from './tetris.js';
// The Founder's desks: every deal is played on one fixed instrument (V10.3 Broker's Desk).
// THEIR number | GAP | YOUR number, read left to right like a ledger line; commits live in the
// rail. Every figure is an engine value or exact arithmetic of recorded fields (pit-ledger.js).
import { parseRate } from './offers.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cents, owned, inventoryCost, finishNowQuote, V7 } from '../tycoon/arcade.js';
import { buyerLive, saleQuote } from '../tycoon/arcade-buyers.js';
import { termLive, termQuote, rivalTerm } from '../tycoon/investors.js';
import { deliveryText } from '../tycoon/strategic.js';
import { HIRES } from '../tycoon/commerce.js';
import { rivalQuotes } from '../tycoon/arcade-negotiation.js';
import { marketEvent } from '../tycoon/founder-market.js';
import { MODEL_NAMES, FOUNDER, executionOf, expansionCapital, openCards, cardState, heldFor, freeOf, companyStats, pendingIntegration, revenueNow, cashRevenueNow, burnOf, totalShares, focusOf, rackOutput } from '../tycoon/founder.js';
import { charmView, charmVerdict, frozenMeter, verdictLabel } from './pit-charm.js';
import { buyerCharmView } from './buyer-charm.js';
import { moonshotView } from './moonshot.js';
import { scenarioView, scenarioBellLines, scenarioReportLines, scenarioChoices } from './scenarios.js';
import { money, signed, rate, short, pctOf, bpsText, phaseName, plural, supplierNews, buyerMood, charmLosses, verdictOf, salePayoff, purchasePayoff,
  laneOf, laneLabel, runText, draftOwnership } from './pit-ledger.js';
import { cardDeskView, builtView, gchip, gpuTag } from './pit-company.js';
import { integrationView } from './integration.js';
import { minigameEligibility } from '../tycoon/replay-access.js';
import { baburPortrait } from './babur.js';

export { money };
const button = (action, label, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${label}</button>`;
const close = (label = 'Back to the floor') => button('close-focus', label, 'class="mat-exit rail-quiet"');
const number = n => esc(String(n));
const note = (text, tone = '') => `<p class="deal-note ${tone}">${text}</p>`;
const hero = (label, value, subtitle = '') => `<div class="deal-quote"><span>${label}</span><strong>${value}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}</div>`;
const input = (attr, value, min = 1, max = 999, step = 1, label = '', cls = '') => `<input ${attr} ${cls ? `class="${cls}"` : ''} type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${number(value)}" aria-label="${esc(label)}">`;
const identity = (name, role, subtitle = '', line = '', reaction = '', mood = 'neutral') => ({ name, role, subtitle, line, reaction, mood });
const chip = s => `<i class="t-chip" aria-hidden="true">${s}s</i>`;
const secs = (until, now) => Math.max(0, Math.ceil(until - now));
const fuse = (until, at, now) => { const left = Math.max(0, until - now), span = Math.max(1, until - at); return `<span class="desk-fuse ${left < 8 ? 'is-short' : ''}" data-fuse style="--left:${Math.min(1, left / span).toFixed(3)}"><b data-station-until="${until}" data-station-at="${at}">${Math.ceil(left)}s</b></span>`; };
const rail = (fact, cls = '') => `<span class="rail-fact ${cls}">${fact}</span>`;
const vault = (action, word, amount, attrs = '') => button(action, `<span class="vault-lock" aria-hidden="true"></span><b>${word}</b>${amount ? `<span class="vault-amt">${amount}</span>` : ''}`, `class="mat-vault rail-commit" data-primary ${attrs}`);
const wide = (short, more) => `${short}<span class="wide"> ${more}</span>`;
const moveOn = (action, label, attrs = '') => button(action, `${label} <span aria-hidden="true">→</span>`, `class="mat-move rail-commit" data-primary ${attrs}`);
const draftTotal = (qty, offer) => Number.isSafeInteger(offer) && offer > 0 ? money(cents(qty, offer)) : '—';
const gapFigs = (qty, diff) => diff ? `<b>${money(cents(qty, Math.abs(diff)))}</b><small>${Math.abs(diff)}¢/h</small>` : '';
const paper = html => `<div class="desk-center"><div class="paper-sheet mat-paper">${html}</div></div>`;
const stampLine = (action, label, attrs = '') => `<div class="sign-line">${button(action, label, `class="mat-stamp is-lit" data-primary ${attrs}`)}<span class="sig-rule" aria-hidden="true">x</span></div>`;
const paperHead = (left, right) => `<header class="contract-head"><span>${left}</span><span>${right}</span></header>`;
// GPUs every open card still misses of one type (cards' recipes − reservations).


// ---- Live previews (the controller paints them on every keystroke or key step) -------------
export function supplierCounterPreview(g, offer) {
  const l = activeLot(g), n = l?.negotiation;
  const open = !!n && available(g, l) && !n.running && !n.closed && !n.attempts.length && n.patience > 0;
  const valid = open && Number.isSafeInteger(offer) && offer > 0 && offer < n.price;
  if (!n) return { valid: false, html: '—', gap: '', label: '' };
  const label = valid ? `OFFER ${money(cents(l.qty, offer))}` : !open ? 'No offers left'
    : offer === n.price ? `Step down<span class="wide"> to offer</span>` : Number.isSafeInteger(offer) && offer > n.price ? 'Above their quote' : 'Whole cents only';
  const gap = Number.isSafeInteger(offer) && offer > 0 && offer <= n.price ? gapFigs(l.qty, n.price - offer) : '<b>—</b>';
  return { valid, html: offer === n.price ? `<span class="is-match">${draftTotal(l.qty, offer)}</span>` : draftTotal(l.qty, offer), gap, label };
}

export function buyerCounterPreview(g, offer, qty) {
  const b = g.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId);
  if (!b) return { valid: false, html: '—', gap: '', label: '' };
  const okQty = Number.isSafeInteger(qty) && qty > 0 && qty <= b.qty - b.filled;
  const open = buyerLive(g, b) && b.negotiation.counters < 2 && !b.negotiation.attempts?.length;
  const valid = open && okQty && Number.isSafeInteger(offer) && offer > b.rate && offer <= 99900;
  const label = valid ? `ASK ${money(cents(qty, offer))}` : !open ? 'Final bid' : !okQty ? 'Choose whole GPUs' : offer === b.rate ? `Step up<span class="wide"> to ask</span>` : Number.isSafeInteger(offer) && offer > 0 && offer < b.rate ? 'Below their bid' : 'Whole cents only';
  const gap = okQty && Number.isSafeInteger(offer) && offer >= b.rate ? gapFigs(qty, offer - b.rate) : '<b>—</b>';
  return { valid, html: !okQty ? '—' : offer === b.rate ? `<span class="is-match">${draftTotal(qty, offer)}</span>` : draftTotal(qty, offer), gap, label };
}

// THEIR BID plate on the resale desk: the bid total, and what those exact units cost you (FIFO).
export function buyerQuoteView(g, qty) {
  const b = g.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId);
  if (!b) return { valid: false, html: '' };
  const d = saleQuote(g, b.id, qty), now = g.arcade.time, free = owned(g, b.gpu);
  const head = `<header class="plate-head"><span>THEIR BID</span>${fuse(b.until, b.at, now)}</header>`;
  const funded = buyerLive(g, b) && Number.isSafeInteger(qty) && qty > 0 && qty <= b.qty - b.filled && cents(qty, b.rate) <= b.budget;
  if (!funded) return { valid: false, html: `${head}<strong class="plate-total money-hero">—</strong><small class="plate-sub negative">Choose up to ${Math.max(0, Math.min(b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))))} funded GPUs</small>` };
  const profit = d ? d.revenue - d.cost : null;
  const paid = d ? `<p class="plate-note ${profit >= 0 ? 'positive' : 'negative'}">You paid ${money(d.cost)} · ${profit >= 0 ? signed(profit) : money(profit)} ${profit >= 0 ? 'profit' : 'loss'}</p>` : `<p class="plate-note negative">You hold ${free} free ${esc(b.gpu)}</p>`;
  return { valid: !!d, html: `${head}<strong class="plate-total money-hero" data-fx-quote data-fx-per="${cents(qty, 1)}">${money(cents(qty, b.rate))}</strong><small class="plate-sub">${rate(b.rate)}/h ×${qty} ${esc(b.gpu)}</small>${paid}` };
}

// The investor counter: a smaller slice for the same check, in half-point steps.
export function termCounterPreview(g, bps) {
  const t = g.arcade.terms.find(t => t.id === g.arcade.confirm?.termId);
  if (!t) return { valid: false, html: '—', own: '', label: '' };
  const open = termLive(g, t) && t.patience > 0 && !g.arcade.signing;
  const valid = open && Number.isSafeInteger(bps) && bps > 0 && bps < t.pct;
  const label = valid ? `COUNTER AT ${bpsText(bps)}` : !open ? 'Final terms' : bps === t.pct ? `Step down<span class="wide"> to counter</span>` : Number.isSafeInteger(bps) && bps > t.pct ? 'Above their ask' : 'Half points only';
  const own = Number.isSafeInteger(bps) && bps > 0 && bps < 10000 ? `You would own <b>${pctOf(draftOwnership(g, bps))}</b>` : '';
  return { valid, html: Number.isSafeInteger(bps) && bps > 0 ? `<span class="${bps === t.pct ? 'is-match' : ''}">${bpsText(bps)}</span>` : '—', own, label };
}
export const parsePct = v => { const n = Number(String(v).trim()); return Number.isFinite(n) && /^\d{1,2}(\.\d{1,2})?$/.test(String(v).trim()) ? Math.round(n * 100) : null; };

// ---- Supplier desk (V10.3 face-off, unchanged in spirit) --------------------------------------
function keys(kind, qty, inputHTML) {
  const key = n => button('step-offer', `<b>${n < 0 ? '−' : '+'}${Math.abs(n)}¢</b><small class="w${Math.abs(n)}">${money(cents(qty, Math.abs(n)))}</small>`,
    `class="mat-key key-${Math.abs(n)}" data-kind="${kind}" data-step="${n}" aria-label="${n < 0 ? 'Decrease' : 'Increase'} ${kind} proposal by ${Math.abs(n)} cents, ${money(cents(qty, Math.abs(n)))} on this lot"`);
  return `<div class="keys">${key(-5)}${key(-1)}<label class="ink-field">${inputHTML}</label>${key(1)}${key(5)}</div>`;
}

function theirPlate(g, l, news, { delta = true, closed = '' } = {}) {
  const total = cents(l.qty, l.negotiation.price), state = closed || (total > cash(g) ? 'Not enough cash' : '');
  const content = brokerOffer(l, total, state);
  return closed ? `<section class="plate their broker-quote is-closed" data-fx-board>${content}</section>`
    : `<button type="button" class="plate their broker-quote" data-action="buy" data-fx-board ${total > cash(g) ? 'disabled' : ''} aria-label="Review purchase: ${l.qty} ${esc(l.gpu)} for ${money(total)} total${state ? `. ${state}` : ''}">${content}</button>`;
}

function supplierReaction(l) {
  const n = l.negotiation, r = [...n.tape].reverse().find(t => t.speaker !== 'YOU'), last = n.attempts.at(-1);
  if (n.running) return ['Make your pitch', 'Let’s see what you’ve got.'];
  if (l.status === 'walked') return ['Supplier walked', r?.text || 'This desk is closed to you.'];
  if (l.status === 'expired' || r?.outcome === 'expired') return ['Quote expired', r?.outcome === 'expired' ? r.text : 'Too late. That allocation is closed.'];
  if (last) {
    const success = last.params.attempt === 1 ? `${last.precision} Charm` : last.params.attempt === 2 ? 'Double Down' : last.precision === 'perfect' ? 'Jackpot' : 'Over-Rizz';
    return [last.tier === 'hit' ? success : last.tier === 'near' ? 'Near miss' : 'Charm missed', r?.text];
  }
  const label = { accept: 'Offer accepted', counter: 'Counteroffer', hold: 'Offer rejected', match: 'Rival matched', beat: 'Rival beaten', decline: 'Rival refused' }[r?.outcome] || 'Opening quote';
  const line = ['match', 'beat', 'decline'].includes(r?.outcome) ? r.text.replace(/ That is my last counter.*$/, '') : r?.outcome === 'accept' ? `Agreed. ${rate(n.price)}. Shall we sign?` : r?.outcome === 'counter' ? `Meet me at ${rate(n.price)}. Your move.` : r?.outcome === 'hold' ? (n.posture === 'firm' && /^That number does not work/.test(r.text) ? `Haggling won’t move me. Show me a better quote.` : `No deal at that number. ${rate(n.price)} stands.`) : n.tape[0]?.text || 'Bring me your number. Let’s talk.';
  return [n.patience === 0 && !n.closed ? `${label} · final quote` : label, line];
}

function supplierView(g, ui) {
  const a = g.arcade, l = activeLot(g), n = l.negotiation, now = a.time, cost = cents(l.qty, n.price), live = available(g, l) && !n.closed;
  const news = supplierNews(l), [reaction, said] = supplierReaction(l), line = reaction === 'Opening quote' && l.line ? l.line : said;
  const who = identity(l.firm, 'seller', n.running ? `${l.qty} ${l.gpu}` : l.favor ? 'held for you' : l.label ? l.label.toLowerCase() : n.rapport || n.posture, g.arcade.practice ? l.gpu === 'H100' ? 'Review the purchase, then sign your contract.' : 'Use Charm, inspect the quote, then sign your contract.' : line, reaction, news.mood);
  const base = { role: 'seller', tone: 'negotiation', identity: who };
  if (n.running) return { ...base, title: 'Charm meter', desk: 'charm', exit: null, body: charmView(g, l), footer: rail(g.arcade.practice ? 'Practice attempt · a miss costs nothing' : 'Leaving now counts as a severe miss', 'rail-warn') };
  if (!live) {
    const stamp = l.status === 'walked' ? 'WALKED' : 'EXPIRED', loss = charmLosses(n, l.qty), entry = n.attempts.at(-1), v = verdictOf(entry, l.qty);
    const minus = x => `${x}`.replace('-', '−');
    const facts = loss ? [loss.gaveBack ? `Gave back ${money(loss.gaveBack)}` : '', loss.trust ? `Trust ${minus(loss.trust)}` : '', loss.clout ? `Clout ${minus(loss.clout)}` : '', v?.stamp === 'EXPIRED' && v.timeCost ? `${v.timeCost}s spent` : ''].filter(Boolean) : [];
    return { ...base, title: stamp === 'WALKED' ? 'Desk closed' : 'Window closed', desk: 'closed', exit: null,
      body: `<div class="desk-center"><div class="closed-desk desk-verdict" data-autofocus tabindex="-1" role="group" aria-label="${stamp === 'WALKED' ? 'Supplier walked' : 'Quote expired'}. No purchase was made.${facts.length ? ' ' + facts.join(', ') + '.' : ''}">${theirPlate(g, l, null, { closed: stamp })}<div class="verdict-block closed-ledger tone-miss">${frozenMeter(entry)}<p class="closed-facts">${facts.length ? facts.map(f => `<span>${f}</span>`).join(' ') : '<span>No purchase made</span>'}</p></div></div></div>`,
      footer: moveOn('close-focus', 'Back to the floor').replace('rail-commit', 'rail-commit rail-solo') };
  }
  const saved = cents(l.qty, l.ask - n.price), lastMove = news && Number.isFinite(news.before) ? cents(l.qty, news.before - news.after) : 0;
  const bank = g.arcade.practice && l.gpu === 'H200' && !ui.training?.charmed?.H200
    ? vault('buy', 'Use Charm first', '', 'disabled aria-label="Use Charm before reviewing the H200 contract"')
    : cost > cash(g)
    ? vault('buy', `Need ${money(cost - cash(g))} more`, '', `disabled aria-label="Bank locked: need ${money(cost - cash(g))} more cash"`)
    : g.arcade.practice ? vault('buy', 'Review contract', money(cost), `aria-label="Review contract for ${money(cost)}"`) : vault('buy', saved > 0 ? 'BANK DEAL' : 'BUY NOW', saved > 0 ? `Save ${money(saved)}` : money(cost), `aria-label="Buy for ${money(cost)}; save ${money(saved)}"`);
  const exit = { action: 'close-focus', label: 'PASS', aria: 'Pass: return to the market; quote kept, desk cools 5 seconds' };
  const selected = taskDeck(g, ui).card, row = selected?.status === 'open' && cardState(g, selected).rows.find(r => r.gpu === l.gpu);
  const missing = row ? Math.max(0, row.need - row.held - row.free) : 0;
  const needLine = `<p class="gap-need gpu-${l.gpu.toLowerCase()}">${row ? `For <b>${esc(selected.name)}</b>: ${missing ? `find <b>${missing}</b> more ${esc(l.gpu)}` : `${esc(l.gpu)} stock is covered`}. ${row.held} allocated · ${row.free} free.` : selected ? `${esc(selected.name)} does not need more ${esc(l.gpu)}.` : `No current task needs ${esc(l.gpu)}.`}</p>`;
  if (n.attempts.length) {
    return { ...base, title: 'Charm verdict', desk: 'verdict', exit,
      body: `<div class="face-off verdict-face desk-verdict" data-autofocus tabindex="-1" role="group" aria-label="${esc(verdictLabel(l))}">${theirPlate(g, l, news, { delta: false })}<div class="verdict-col">${charmVerdict(l)}</div><div class="leverage"><div class="deal-charm">${charmView(g, l)}</div></div></div>`,
      footer: rail(saved > 0 ? `${money(saved)} saved from ask` : `Charm ${n.attempts.length}/3 used`, 'wide-only') + bank };
  }
  if (g.arcade.practice && l.gpu === 'H100') return { ...base, title: l.qty === 1 ? 'Your first H100' : 'GPU purchase', desk: 'haggle', exit, body: `<div class="charm-first">${theirPlate(g, l, news)}</div>`, footer: bank };
  const offer = ui.counter ?? ((n.haggles ? n.price : Math.max(1, n.price - 8)) / 100).toFixed(2), preview = supplierCounterPreview(g, parseRate(offer));
  const rival = rivalQuotes(g)[0];
  const rivalCard = rival ? `<div class="rival-slip mat-carbon"><div><span>${wide('Rival', 'quote')}</span><b>${esc(rival.firm)} · ${rate(rival.rate)}/h</b>${l.until <= now + 2 ? '<em>Using it now expires this quote.</em>' : ''}</div>${button('play-rival', `Slap it${'<span class="wide"> down</span>'} ${chip(2)}`, `data-id="${esc(rival.id)}" class="rival-play" aria-label="Tell ${esc(l.firm)} that ${esc(rival.firm)} is quoting ${rate(rival.rate)} per GPU-hour for ${rival.qty} ${esc(l.gpu)}, ${secs(rival.until, now)} seconds left. One play per desk; uses one offer and 2 seconds."`)}</div>`
    : n.leverage ? `<p class="rival-played mat-carbon"><span>Played</span><b>${esc(n.leverage.firm)} ${rate(n.leverage.rate)}</b></p>` : '';
  const slip = n.patience > 0
    ? `<section class="slip yours mat-paper" aria-label="Your offer"><header class="plate-head"><span>${wide('YOUR', 'OFFER')}</span></header><strong class="slip-total money-hero" data-counter-total aria-live="polite">${preview.html}</strong>${keys('supplier', l.qty, input('data-counter', offer, .01, (n.price / 100).toFixed(2), .01, 'Your supplier proposal in dollars per GPU-hour'))}${button('haggle', `<span data-offer-label>${preview.label}</span>${chip(2)}`, `class="mat-strip ${preview.valid ? 'is-lit' : ''}" ${preview.valid ? '' : 'disabled'} aria-label="Make this offer; uses 2 seconds"`)}</section>`
    : `<section class="slip yours mat-paper is-spent"><header class="plate-head"><span>YOUR OFFER</span></header><p class="slip-spent">No offers left</p></section>`;
  const fact = saved > 0 && saved !== lastMove ? `${money(saved)} saved` : '';
  const gap = `<div class="gap-col">${n.patience > 0 ? `<span class="gap-label">GAP</span><span class="gap-figs" data-counter-gap>${preview.gap}</span>` : ''}${fact ? `<p class="gap-fact">${fact}</p>` : ''}${needLine}</div>`;
  return { ...base, title: l.favor ? 'Held for you' : 'Supply desk', desk: 'haggle', exit,
    body: `<div class="charm-first">${theirPlate(g, l, news)}<div class="deal-charm">${charmView(g, l)}</div>${needLine}<details class="manual-offer"><summary>Make an offer</summary><div class="face-off supplier-face">${gap}${slip}<div class="leverage">${rivalCard}</div></div></details></div>`,
    footer: rail(l.liquidation ? 'Liquidation book' : `${n.posture} supplier`, 'wide-only') + bank };
}

// ---- Resale desk: sell spare (free) capacity to a funded spot bid ---------------------------
export function buyerActions(g, qty) {
  const b = g.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId);
  if (!b || !buyerLive(g, b)) return '';
  const sale = saleQuote(g, b.id, qty), free = owned(g, b.gpu);
  if (sale) return rail(`${free} free ${esc(b.gpu)}`, 'wide-only') + vault('sell-buyer', `SELL ${qty}`, money(sale.revenue), `aria-label="Sell ${qty} ${esc(b.gpu)} for ${money(sale.revenue)}: review the contract"`);
  return rail(`You hold ${free} free ${esc(b.gpu)}`) + moveOn('open-market', `Find ${esc(b.gpu)}`, `data-filter="supply" data-gpu="${esc(b.gpu)}"`);
}

function buyerView(g, ui) {
  const a = g.arcade, b = a.buyers.find(b => b.id === a.confirm.buyerId), n = b.negotiation, live = buyerLive(g, b), wanted = b.qty - b.filled;
  const funded = Math.min(wanted, Math.floor(b.budget / cents(1, b.rate))), free = owned(g, b.gpu), qty = n.lockedQty && !n.charmClosed ? n.lockedQty : ui.qty ?? Math.max(1, Math.min(free || funded, funded, n.lockedQty || Infinity));
  const offer = ui.buyerCounter ?? ((b.rate + (n.counters ? 0 : 5)) / 100).toFixed(2), quote = buyerQuoteView(g, Number(qty)), counter = buyerCounterPreview(g, parseRate(offer), Number(qty));
  const r = n.tape.at(-1), reaction = !live ? (n.walked ? 'Buyer walked' : 'Bid closed') : ({ accept: 'Bid raised', counter: 'Counteroffer', hold: 'Bid stands' }[r?.outcome] || 'Funded bid');
  const line = !live ? 'This bid is off the table.' : n.attempts?.length ? r.text : r?.outcome === 'hold' ? `That’s my limit. ${rate(b.rate)} stands.` : r?.outcome === 'accept' || r?.outcome === 'counter' ? `${rate(b.rate)}. My budget covers ${funded} ${b.gpu}.` : `I’ll take ${funded} ${b.gpu} of spare capacity.`;
  const who = identity(b.name, 'buyer', `${funded} funded · ${free} free in your stock`, line, reaction, buyerMood(b, live));
  if (!live) return { title: 'Bid closed', role: 'buyer', tone: 'negotiation', identity: who, desk: 'closed', exit: null,
    body: `<div class="desk-center"><div class="closed-desk desk-verdict" data-autofocus tabindex="-1" role="group" aria-label="${n.walked ? 'Buyer walked' : 'Bid closed'}. No sale made."><section class="plate their is-closed" data-fx-board><header class="plate-head"><span>THEIR BID</span><span class="plate-off">CLOSED</span></header><strong class="plate-total money-hero"><s>${rate(b.rate)}/h</s></strong><small class="plate-sub">${wanted} ${esc(b.gpu)} wanted</small><strong class="closed-stamp" data-fx-verdict>${n.walked ? 'WALKED' : 'CLOSED'}</strong></section>${buyerCharmView(g, b, Number(qty))}<p class="closed-facts"><span>No sale made</span></p></div></div>`, footer: moveOn('close-focus', 'Back to the floor').replace('rail-commit', 'rail-commit rail-solo') };
  const ask = n.counters < 2
    ? `<section class="slip yours mat-paper" aria-label="Your ask"><header class="plate-head"><span>${wide('YOUR', 'ASK')}</span></header><strong class="slip-total money-hero" data-buyer-proposal aria-live="polite">${counter.html}</strong>${keys('buyer', Number(qty) || 1, input('data-buyer-counter', offer, (b.rate / 100).toFixed(2), 999, .01, 'Your resale ask in dollars per GPU-hour'))}${button('counter-buyer', `<span data-ask-label>${counter.label}</span>${chip(1)}`, `class="mat-strip ${counter.valid ? 'is-lit' : ''}" ${counter.valid ? '' : 'disabled'} aria-label="Send this ask; uses 1 second"`)}</section>`
    : `<section class="slip yours mat-paper is-spent" aria-label="Final bid"><header class="plate-head"><span>FINAL BID</span></header><p class="slip-spent">No counters left</p></section>`;
  const gap = n.counters < 2 ? `<div class="gap-col"><span class="gap-label">GAP</span><span class="gap-figs" data-buyer-gap>${counter.gap}</span><p class="gap-fact">${2 - n.counters} counter${n.counters === 1 ? '' : 's'} left</p><p class="gap-need">Only free GPUs sell. Reserved ones stay on their cards.</p></div>` : '<div class="gap-col"></div>';
  return { title: 'Resell spare capacity', role: 'buyer', tone: 'negotiation', identity: who, desk: 'bid',
    body: `<div class="charm-first resale-desk"><div class="resale-bid"><section class="plate their" data-fx-board aria-label="Their bid"><div data-sale-math>${quote.html}</div></section>${!n.lockedQty || n.charmClosed ? `<label class="qty-chip">GPUs ${input('data-sale-qty', qty, 1, Math.min(wanted, free || funded, n.lockedQty || Infinity), 1, 'GPUs to sell')}</label>` : `<p class="resale-quantity">${qty} GPUs · negotiated block<input type="hidden" data-sale-qty value="${qty}"></p>`}</div><div data-buyer-charm>${buyerCharmView(g, b, Number(qty))}</div>${!n.attempts?.length ? `<details class="manual-offer"><summary>Make an offer</summary><div class="resale-manual">${gap}${ask}</div></details>` : ''}</div>`,
    footer: n.running ? '' : `<span data-buyer-actions>${buyerActions(g, Number(qty))}</span>` };
}

// ---- Investor term sheet -------------------------------------------------------------------
function ownBar(before, after) {
  const w = x => `${Math.max(0, x * 100).toFixed(2)}%`;
  return `<div class="own-bar" aria-hidden="true"><span class="own-you" style="width:${w(after)}"></span><span class="own-new" style="width:${w(before - after)}"></span><span class="own-old" style="width:${w(1 - before)}"></span></div>`;
}
// A competing sheet on the table: show it to this investor (once), or go and read it.
function rivalBlock(g, t) {
  const x = rivalTerm(g, t); if (!x) return '';
  return `<div class="ts-rival"><p><b>ALTERNATIVE OFFER</b><span>${esc(x.name)}${x.fund ? ` · ${esc(x.fund)}` : ''}: ${money(x.amount)} ${x.funding === 'compute' ? 'compute value' : 'cash'} for ${bpsText(x.pct)}</span></p><p class="ts-rival-acts">` +
    (t.rivalPlayed ? '<span class="ts-rival-used">You showed them</span>' : button('play-rival-term', 'Show them this offer', 'class="mat-chip" aria-label="Show this investor the rival offer; uses 1 second"')) +
    button('review-term', `Read ${esc(x.name.split(' ')[0])}’s sheet`, `class="mat-chip" data-id="${esc(x.id)}"`) + '</p></div>';
}
function termView(g, ui) {
  const a = g.arcade, t = a.terms.find(t => t.id === a.confirm.termId), q = termQuote(g), s = companyStats(g), now = a.time;
  const r = [...t.tape].reverse().find(x => x.speaker !== 'YOU'), outcome = r?.outcome;
  const reaction = { accept: 'Counter accepted', counter: 'Counteroffer', hold: 'Terms stand' }[outcome] || t.label;
  const line = (outcome ? r.text : t.pitch).replace(/ That is our final offer\.$/, '');
  const who = identity(t.name, 'investor', `${t.label}${t.fund ? ` · ${t.fund}` : ''}${t.patience ? '' : ' · final terms'}`, line, reaction, outcome === 'hold' || outcome === 'walk' ? 'annoyed' : outcome === 'accept' ? 'pleased' : 'eager');
  if (!q) return { title: 'Term sheet closed', role: 'investor', identity: who, desk: 'closed', exit: null, body: paper(note('These terms are no longer open.')), footer: moveOn('close-focus', 'Back to the floor').replace('rail-commit', 'rail-commit rail-solo') };
  const step = t.pct < 200 ? 1 : 50;
  const draft = ui.termPct ?? (Math.max(1, t.pct - step) / 100).toFixed(2), preview = termCounterPreview(g, parsePct(draft));
  const sheet = `<section class="term-sheet mat-paper" aria-label="Term sheet"><p class="company-identity">${esc(g.company.name)}</p>${paperHead(`TERM SHEET · ${esc(t.label)}`, fuse(t.until, t.at, now))}` +
    `<div class="ts-hero"><p><span>${q.funding === 'compute' ? 'Compute value · no cash' : 'Cash check'}</span><strong class="money-hero" data-fx-quote>${money(q.amount)}</strong></p><p class="ts-for"><span>for</span><strong>${bpsText(q.pct)}</strong></p></div>` +
    (t.institutional === 'sovereign' ? `<p class="ts-delivery"><b>Complete Moonshot by R${t.milestoneDue} bell.</b><br>Miss: exit value −15%.<br>$1.8M capital + GPUs. No cash clawback.</p>` : q.conditions ? `<p class="ts-delivery">${esc(q.conditions)}</p>` : '') +
    (q.tranches ? `<p class="ts-delivery">${esc(deliveryText(q.tranches))}</p><details class="compute-terms"><summary>Expiry & delivery terms</summary><p>Unused units expire at each delivery bell. No cash redemption or equity refund. Future units are unavailable until delivery. Shutdown cancels undelivered service. Value is discounted replacement cost, not added company valuation.</p></details>` : '') +
    `<div class="ts-own"><p><span>You own</span><b>${pctOf(q.founderBefore)}</b><i aria-hidden="true">→</i><b class="is-after">${pctOf(q.founderAfter)}</b></p>${ownBar(q.founderBefore, q.founderAfter)}</div>` +
    `<details class="compute-terms"><summary>Pricing details</summary><dl class="ts-figs"><div><dt>Pre-money</dt><dd>${short(q.pre)}</dd></div><div><dt>Post-money</dt><dd>${short(q.post)}</dd></div><div><dt>Company value</dt><dd>${short(s.valuation)}</dd></div></dl><p class="ts-fine">${q.shares.toLocaleString('en-US')} new shares. ${q.funding === 'compute' ? 'Replacement value, not cash or a valuation bonus.' : 'Investment goes to the company.'}</p></details>${rivalBlock(g, t)}</section>`;
  const slip = t.patience > 0
    ? `<section class="slip yours mat-paper term-counter" aria-label="Your counter"><header class="plate-head"><span>${wide('YOUR', 'COUNTER')}</span><span>${plural(t.patience, 'try', 'tries')} left</span></header><strong class="slip-total money-hero" data-term-total aria-live="polite">${preview.html}</strong><p class="ts-would" data-term-own>${preview.own}</p>` +
      `<div class="keys term-keys">${button('step-term', `<b>-${step / 100}%</b>`, `class="mat-key key-5" data-step="-${step}" aria-label="Ask for ${step / 100} percentage points less"`)}<label class="ink-field pct-field">${input('data-term-pct', draft, .01, (Math.max(1, t.pct - 1) / 100).toFixed(2), .01, 'Your counter in percent of the company')}</label>${button('step-term', `<b>+${step / 100}%</b>`, `class="mat-key key-5" data-step="${step}" aria-label="${step / 100} percentage points more"`)}</div>` +
      `${button('counter-term', `<span data-term-label>${preview.label}</span>${chip(2)}`, `class="mat-strip ${preview.valid ? 'is-lit' : ''}" ${preview.valid ? '' : 'disabled'} aria-label="Counter with this percentage; uses 2 seconds"`)}</section>`
    : `<section class="slip yours mat-paper is-spent"><header class="plate-head"><span>YOUR COUNTER</span></header><p class="slip-spent">Final terms. Accept or decline.</p></section>`;
  return { title: t.vulture ? 'The Vulture Round' : 'Term sheet', role: 'investor', tone: 'negotiation', identity: who, desk: 'term', exit: { action: 'close-focus', label: 'Step away', aria: 'Step away: the term sheet stays open until its window closes' },
    body: `<div class="term-desk">${sheet}${t.patience > 0 ? `<details class="term-negotiation"><summary>Negotiate ownership</summary>${slip}</details>` : ''}</div>`,
    footer: button('decline-term', 'Decline', 'class="mat-exit term-choice" aria-label="Decline this term sheet"') + button('accept-term', 'Accept & review', `class="mat-exit term-choice" aria-label="Accept: ${q.funding === 'compute' ? 'compute worth' : 'raise'} ${money(q.amount)} for ${bpsText(q.pct)}; review the contract"`) };
}

// ---- Contract and receipts -----------------------------------------------------------------
function contractView(g, d) {
  const purchase = d.kind === 'purchase', term = d.kind === 'term';
  const compute = d.funding === 'compute';
  let terms, sub, after = cash(g) + (compute ? 0 : purchase ? -d.total : d.total);
  if (purchase) { terms = `BUY ${d.qty} ${esc(d.gpu)} from ${esc(d.counterparty)}`; sub = `${rate(d.rate)}/h · ${d.savings > 0 ? `${money(d.savings)} under their opening ask` : 'at their opening ask'}`; }
  else if (term) { terms = `ISSUE ${d.shares.toLocaleString('en-US')} NEW SHARES TO ${esc(d.counterparty.toUpperCase())}`; sub = `${bpsText(d.qty)} of the company · you own ${pctOf(d.founderBefore)} → ${pctOf(d.founderAfter)}`; }
  else { const p = d.total - d.cost; terms = `RESELL ${d.qty} ${esc(d.gpu)} to ${esc(d.counterparty)}`; sub = `you paid ${money(d.cost)} · ${p >= 0 ? signed(p) : money(p)} ${p >= 0 ? 'profit' : 'loss'}`; }
  const role = purchase ? 'seller' : term ? 'investor' : 'buyer';
  if (d.conditions) sub += `<br>${esc(d.conditions)}`;
  return { title: purchase ? 'Your GPU contract' : 'The contract', desk: 'contract', exit: { action: 'cancel-sign', label: g.arcade.practice ? 'Back' : term ? 'Back to the terms' : 'Keep negotiating', ...(g.arcade.practice ? { aria: 'Back to quote' } : {}) }, role, tone: 'signing',
    identity: identity(d.counterparty, role, 'Contract ready', compute ? 'Capacity for equity. The delivery schedule is binding.' : term ? 'Welcome aboard. Sign and the wire goes out.' : 'One signature makes it official.', '', 'pleased'),
    body: `<div class="desk-center"><article class="contract mat-paper" data-fx-contract>${paperHead('HSC · EXECUTION COPY', purchase ? 'PURCHASE' : term ? 'EQUITY ROUND' : 'RESALE')}<p class="contract-terms">${terms}</p><strong class="contract-total money-hero">${money(d.total)}</strong><p class="contract-sub">${sub}</p>${compute ? `<p class="ts-delivery">Compute value, not cash. ${esc(deliveryText(d.tranches))}</p>` : ''}<div class="sign-line">${button('sign-it', `${purchase ? 'Sign contract · Pay' : 'SIGN · ' + (compute ? 'COMPUTE' : term ? 'RAISE' : 'RECEIVE')} ${short(d.total)}`, 'class="mat-stamp is-lit" data-primary')}<span class="sig-rule" aria-hidden="true">x</span></div><p class="contract-fine">Signing rechecks the ${term ? 'terms, window and cap table' : 'quote, deadline, stock and cash'}.</p></article></div>`,
    footer: rail(`Cash after ${money(after)}`) };
}

// After a purchase: one tap puts the new GPUs on a card that still needs them.
function allocations(g, d) {
  const free = freeOf(g, d.gpu);
  return openCards(g).filter(o => (o.recipe[d.gpu] || 0) > heldFor(g, o.id, d.gpu)).map(o => {
    const st = cardState(g, o), row = st.rows.find(r => r.gpu === d.gpu), n = Math.min(d.qty, row.need - row.held, free);
    if (n <= 0) return '';
    const ready = st.missing - n === 0 && !st.cashNeeded;
    return button('allocate', `<span class="al-lane">${esc(laneLabel(o).toUpperCase())}</span><b>${esc(o.name)}</b><span class="al-after">Allocate ${n} ${esc(d.gpu)}${ready ? ' · then BUILD' : st.cashNeeded ? ` · cash short ${short(st.cashNeeded)}` : ''}</span>`,
      `class="allocate lane-${laneOf(o)} ${ready ? 'is-ready' : ''}" data-card="${esc(o.id)}" aria-label="Allocate ${n} ${esc(d.gpu)} to ${esc(o.name)}${ready ? ': ready to build after allocation' : st.cashNeeded ? `: ${money(st.cashNeeded)} more cash needed to build` : ''}"`);
  }).filter(Boolean);
}

function receiptView(g, d) {
  const purchase = d.kind === 'purchase', term = d.kind === 'term', role = purchase ? 'seller' : term ? 'investor' : 'buyer';
  let payoff, fine = '', footer;
  if (purchase) {
    const p = purchasePayoff(d), tokens = `<span class="gpu-chips" aria-hidden="true">${Array.from({ length: Math.min(8, p.qty) }, (_, i) => gchip(p.gpu, 'is-big', i)).join('')}</span>`;
    const alloc = g.arcade.practice ? [] : allocations(g, d);
    payoff = `<div class="payoff payoff-stock" data-fx-payoff>${tokens}<strong class="payoff-hero">${p.qty} ${esc(p.gpu)} in your stock</strong><p class="payoff-sub">Paid ${money(p.paid)} · ${p.savings > 0 ? `${money(p.savings)} under their opening ask` : 'at their opening ask'}</p></div>` +
      (g.arcade.practice ? '<p class="payoff-fine">GPU contract signed. Your practice inventory and cash have been updated.</p>' : alloc.length ? `<div class="allocations" role="group" aria-label="Put them to work">${alloc.join('')}</div>` : `<p class="payoff-fine">No open card needs ${esc(d.gpu)} now. Keep them for a later card this round, or resell them.</p>`);
    fine = g.arcade.practice ? `<p class="payoff-fine">Practice cash remaining: ${money(cash(g))}</p>` : '<p class="payoff-fine">Unbuilt GPUs expire at the bell</p>';
    footer = g.arcade.practice ? moveOn('post-receipt',d.gpu==='H100'?'H100 secured · find H200 →':'Both GPUs secured · plan the rack →').replace('rail-commit','rail-commit rail-solo') : alloc.length ? rail('Or keep them free', 'wide-only') + button('post-receipt', 'Keep in inventory', 'class="mat-exit rail-quiet rail-keep"') : moveOn('post-receipt', 'Back to the floor').replace('rail-commit', 'rail-commit rail-solo');
  } else if (term) {
    payoff = `<div class="payoff payoff-raise" data-fx-payoff><span class="payoff-label">${d.funding === 'compute' ? 'Compute secured · no cash raised' : 'Raised'}</span><strong class="payoff-hero money-hero win">${money(d.total)}</strong><p class="payoff-sub">for ${bpsText(d.qty)} · you now own <b>${pctOf(d.founderAfter)}</b></p>${ownBar(d.founderBefore, d.founderAfter)}</div>`;
    fine = d.tranches ? `<p class="ts-delivery">${esc(deliveryText(d.tranches))}</p><p class="payoff-fine">Unused units expire at their delivery bell. Equity remains issued.</p>` : '<p class="payoff-fine">Company cash, not founder income. Your stake is what pays at the exit.</p>';
    footer = moveOn('post-receipt', 'Back to the floor').replace('rail-commit', 'rail-commit rail-solo');
  } else {
    const s = salePayoff(d), cls = s.win ? 'win' : 'loss';
    fine = d.premium > 0 ? `<p class="payoff-fine positive">${money(d.premium)} negotiated above the opening bid</p>` : '';
    payoff = `<div class="payoff payoff-${cls}" data-fx-payoff><span class="payoff-label">Resale ${s.win ? 'profit' : 'loss'}</span><strong class="payoff-hero money-hero ${cls}">${s.profit >= 0 ? signed(s.profit) : money(s.profit)}</strong><p class="payoff-sub">${money(s.revenue)} received − ${money(s.cost)} you paid</p><div class="spread-bar ${cls}" aria-hidden="true"><span class="bar-base" style="width:${s.base}%"></span><span class="bar-tail" style="width:${s.tail}%"></span></div><p class="spread-ends"><span>PAID ${rate(Math.round(s.costRate))}/h</span><span>SOLD ${rate(s.soldRate)}/h</span></p></div>`;
    if (d.stock) {
      payoff = `<div class="resale-review" role="status" aria-live="polite"><h3>Sale complete</h3><p>${d.qty} ${esc(d.gpu)} sold to ${esc(d.counterparty)}.</p><p><strong>${money(d.total)}</strong> received in cash.</p><p>${d.stock.freeAfter} ${esc(d.gpu)} available · ${d.stock.committedAfter} committed and unchanged.</p></div>`;
      fine = '';
      footer = button('sale-inventory', 'Back to inventory', 'class="resale-secondary"') + button('sale-buyers', 'View buyers', 'class="resale-action"');
    } else footer = moveOn('post-receipt', 'Back to the floor').replace('rail-commit', 'rail-commit rail-solo');
  }
  if (g.arcade.practice && term) {
    payoff = `<div class="payoff payoff-raise training-investment-receipt" data-fx-payoff><span class="payoff-label">Investment signed</span><strong class="payoff-hero money-hero">+${money(d.total)}</strong><p class="training-equity-exchange">Your ownership <b>${pctOf(d.founderBefore)}</b><span aria-hidden="true">→</span><b>${pctOf(d.founderAfter)}</b></p>${ownBar(d.founderBefore,d.founderAfter)}</div>`;
    fine = `<p class="payoff-fine">Practice cash now <b>${money(cash(g))}</b>. The fund owns ${bpsText(d.qty)}.</p>`;
    footer = moveOn('post-receipt','See the cluster opportunity →').replace('rail-commit','rail-commit rail-solo');
  }
  if (g.arcade.practice && purchase && d.qty===2 && d.gpu==='H100') {
    fine = `<p class="payoff-fine">Practice cash now <b>${money(cash(g))}</b></p>`;
    footer = moveOn('training-network-build','Build network · $5,000 →').replace('rail-commit','rail-commit rail-solo');
  }
  if (g.arcade.practice && purchase && d.qty>=48) {
    const card=g.arcade.objectives.find(c=>c.id==='practice-cluster');
    fine=`<p class="payoff-fine">Practice cash now <b>${money(cash(g))}</b></p>`;
    footer=moveOn('training-large-build',`Build cluster · ${money(card?.cashCost ?? expansionCapital(g,{H100:48}))} capital →`).replace('rail-commit','rail-commit rail-solo');
  }
  const title = purchase ? 'GPUs secured.' : term ? g.arcade.practice ? 'Investment signed.' : 'Round closed.' : 'Capacity resold.';
  if (d.conditions) fine += `<p class="payoff-fine">${esc(d.conditions)}</p>`;
  return { title, role, tone: 'receipt', desk: 'receipt', exit: null,
    identity: identity(d.counterparty, role, purchase ? `${d.qty} ${d.gpu} · signed` : term ? `${bpsText(d.qty)} · signed` : `${d.qty} ${d.gpu} · signed`, purchase ? 'Your compute. Put it to work.' : term ? 'Now go build something huge.' : 'Good doing business.', '', 'pleased'),
    body: `<div class="desk-center"><article class="receipt mat-paper is-signed ${purchase ? 'is-purchase' : ''}">${paperHead(`HSC · ${esc(d.id)}`, `<span class="wide">${esc(d.counterparty)}</span>`)}<strong class="deal-stamp" data-fx-stamp>SIGNED</strong>${payoff}${fine}</article></div>`,
    footer };
}

// ---- Before the bell: what lapses, what expires, what comes online -----------------------------
// V10.17.3 execution quality: an early bell improves the outcome of this round's projects (none: nothing to improve).
function execLine(g) {
  const exec = executionOf(g.arcade.time, V7.seconds), n = g.company.builds.filter(b => b.q === g.q).length;
  if (!exec) return '';
  return n ? `<p class="bell-exec"><b>FAST CLOSE · +${Math.round(exec * 100)}% OUTCOME QUALITY</b><span>${plural(n, 'project')} ${n === 1 ? 'resolves' : 'resolve'} at this bell</span></p>`
    : `<p class="bell-exec is-idle"><span>No projects this round: an early bell improves nothing.</span></p>`;
}
function bellView(g) {
  const a = g.arcade, c = g.company, last = g.q >= campaignLimit(g), qty = a.inventory.reduce((n, x) => n + x.left, 0), lost = inventoryCost(g);
  const lapsing = openCards(g).filter(o => heldFor(g, o.id)).map(o => `<li class="lane-${laneOf(o)}"><b>${esc(o.name)}</b><span>${heldFor(g, o.id)}/${cardState(g, o).total} reserved · lapses</span></li>`).join('');
  const pending = pendingIntegration(g).map(b => `<li class="lane-${laneOf(b)}"><b>${esc(b.name)}</b><span>comes online at the bell</span></li>`).join('');
  const owed = scenarioBellLines(g), late = g.arcade.objectives.some(o => o.kind === 'scenario' && o.status === 'open' && o.scenario?.penalty && !cardState(g, o).ready);
  const revenue = cashRevenueNow(c), prepaid = revenueNow(c) - revenue, burn = burnOf(c), payroll = !pending && cash(g) + revenue < burn;
  const finalBell = last && g.q >= 10;
  return { title: finalBell ? 'Ring the final bell?' : 'Ring the bell?', role: 'report', desk: 'paper', exit: null,
    body: paper(hero(qty ? 'Unbuilt GPUs expire' : 'Nothing expires', qty ? `${plural(qty, 'GPU')} · ${money(lost)}` : '$0', qty ? 'Their cost is already paid. Reservations lapse with them.' : 'Every GPU you bought this round is built or sold.') +
      (owed ? `<ul class="bell-list scn-owed">${owed}</ul>` : '') + (late ? note('A signed commitment is not built. Ringing the bell now counts as a missed delivery.', 'negative') : '') +
      (lapsing || pending ? `<ul class="bell-list">${lapsing}${pending}</ul>` : '') +
      `<p class="bell-flow"><span>Revenue in <b>${money(revenue)}</b></span><span>Burn out <b>${money(burn)}</b></span>${prepaid ? `<small>${money(prepaid)} of revenue was already prepaid.</small>` : ''}${pending ? '<small>Integrations at the bell can change these.</small>' : ''}</p>` +
      (payroll ? note(`Cash ${money(cash(g))} + revenue ${money(revenue)} cannot cover ${money(burn)} payroll: the company shuts down at this bell.`, 'negative') : '') +
      (last ? note(finalBell ? 'Round ten is the final bell. Your company’s ending determines one total bag.' : `This bell completes round ${g.q}. Settle your company’s results.`) : '') + execLine(g)), footer: close('Keep trading') + button('finish', finalBell ? 'RING THE FINAL BELL' : 'SETTLE THIS ROUND', 'class="mat-move rail-commit"') };
}

// ---- The bell report: one punchy board update ------------------------------------------------
// V10.17.3: why a project beat (or missed) expectations, in at most two short reasons.
function whyOf(g, b) {
  const why = [];
  if ((b.exec || 0) >= .02) why.push('Fast close');
  if (b.grade === 'S' || b.grade === 'A') why.push(`${b.grade} rack`);
  if (b.lane === 'product' && g.company.level - (b.tier - 1) >= 2) why.push('Strong model');
  if (b.boosted) why.push('Combined');
  return why.slice(0, 2).join(' · ');
}
const outcomeTag = b => b.outcome && b.outcome.mult !== 1 ? ` · ×${b.outcome.mult.toFixed(2)}` : '';
function buildLine(g, b) {
  if (b.moonshot !== undefined) return b.moonshotOutcome ? `Frontier ${b.moonshotOutcome}; ${money(b.cashCost)} training capital spent` : 'Frontier cluster committed; integration determines delivery';
  const c = g.company, R = b.reward || {}, m = 1 + FOUNDER.quality * c.level;
  if (R.pilotRevenue) return pilotResultLine(b);
  if (b.status === 'delayed') return `${Math.round(b.online * 100)}% online · the rest next bell${outcomeTag(b)}`;
  if (R.hire) { const h=c.team.find(h=>h.build===b.id); return h ? `Hired · ${Math.round(h.effect*100)}% effectiveness · salary begins this bell` : 'Hire awaiting integration'; }
  if (R.agi) { const A = { ...FOUNDER.agi, ...b.agiStakes }; return b.agiOutcome === 'agi' ? `AGI (fictional) · +${short(A.tech)} technology value · +${Math.round((A.revenue - 1) * 100)}% revenue`
    : b.agiOutcome === 'partial' ? `Superhuman researcher · +${short(A.partialTech)} technology value` : b.agiOutcome === 'failure' ? `Failed · capital spent · remediation ${short(A.failBurn)}/round for ${A.failRounds} rounds` : 'Racked'; }
  const why = whyOf(g, b), tail = `${outcomeTag(b)}${why ? ` · ${why}` : ''}`;
  if (R.revenue) { const p = c.products.find(p => p.build === b.id); return p ? `Live · earns ${money(Math.round(Math.round(p.revenue * p.online) * m))}/round${tail}` : 'Live'; }
  if (R.level) return b.result ? `${runText(b.result)} · Model ${b.result === 'setback' ? 'stays' : '→'} ${esc(MODEL_NAMES[b.result === 'setback' ? c.level : Math.max(c.level, R.level)])}${b.ipPaid ? ` · +${short(b.ipPaid)} IP` : ''}${why ? ` · ${why}` : ''}` : 'Training · result at the bell';
  if (R.rack) { const k = c.racks.find(k => k.build === b.id); return `Rack · +${k ? k.qty : R.rack.qty} ${R.rack.gpu} every round${tail}`; }
  if (R.ip) return `Research IP · +${short(b.ipPaid || R.ip)}${tail}`;
  if (R.cash) return `Prize · +${money(b.paid || R.cash)} cash`;
  if (R.hype) return `Breakthrough · +${short(b.ipPaid || 0)} research IP`;
  return 'Built';
}
function extensionView(g) {
  const next=g.q+1,quote=finishNowQuote(g),earned=qualification(g).paths.find(p=>p.complete);
  return {title:`Round ${g.q} complete`,role:'report',desk:'paper',exit:null,
    body:`<article class="v21-bonus"><div class="v21-bonus-portrait">${baburPortrait('broker')}</div><div class="v21-bonus-copy"><span class="v21-speaker">Babur</span><p>You earned Round ${next}, if you choose to take it.</p><p>You can end now with <strong data-finish-now="${quote.payout}">${money(quote.payout)}</strong>, or keep going to see if you can get more.</p><small>${quote.retained ? `${money(quote.realized)} cash proceeds + ${money(quote.retained)} retained equity. Equity is paper value.` : 'Your current founder result in cash proceeds.'}</small>${earned?`<p class="v21-earned">${esc(earned.label)} · completed</p>`:''}</div></article>`,
    footer:button('extension-finish','End &amp; Share Score','class="mat-exit v21-end"')+button('extension-continue',`Play Round ${next}`,'class="mat-move rail-commit"')};
}
function reportView(g) {
  const a = g.arcade, r = a.history.at(-1), c = g.company, next = marketEvent(g);
  const builds = r.builds.map(id => c.builds.find(b => b.id === id)).filter(Boolean).sort((a,b) => Number(!!b.scenario || !!b.result) - Number(!!a.scenario || !!a.result));
  const integ = r.integrated || [];
  // V10.17.3 stamps: the project's outcome (UNDER / EXCEEDED / BREAKTHROUGH), a setback, or a plain build.
  const stamp = b => b.agiOutcome ? { agi: 'AGI', partial: 'PARTIAL', failure: 'FAILED' }[b.agiOutcome] : b.result === 'setback' ? 'SETBACK' : b.outcome?.tier === 'breakthrough' || b.result === 'breakthrough' ? 'BREAKTHROUGH'
    : b.outcome?.tier === 'exceeded' ? 'EXCEEDED' : b.outcome?.tier === 'under' ? 'UNDER' : b.lane === 'opportunity' ? 'WON' : 'BUILT';
  const items = builds.map(b => `<li class="lane-${laneOf(b)} ${b.result ? `run-${b.result}` : ''} ${b.outcome ? `out-${b.outcome.tier}` : ''}"><strong class="bu-stamp">${stamp(b)}</strong><b>${esc(b.name)}</b><span>${buildLine(g, b)}</span></li>`);
  const pz = r.puzzle, pct = x => `${Math.round(x * 100)}%`;
  const intLines = integ.map(x => `<li class="${x.delayed ? 'is-delayed' : ''}"><b>${esc(x.name)}</b><span>${x.carried ? 'Delayed capacity: now 100% online' : x.delayed ? `${pct(x.online)} online · ${pct(1 - x.online)} next bell` : `100% online${x.tuned ? ' · TUNED' : ''}`}</span></li>`).join('');
  // V10.15: the grade and the lasting bonus it left, in the same line.
  const bonus = pz?.gains ? Object.entries(pz.gains).map(([k, d]) => ` · +${Math.max(1, Math.round(d * 100))}% ${k === 'readiness' ? 'frontier readiness' : `${k} efficiency`}`).join('') : '';
  const pzLine = !pz ? '' : (pz.skipped ? `Integration crew baseline: ${pct(pz.efficiency)}` : pz.perfect ? `${pz.kind === 'cable' ? 'PERFECT FABRIC' : pz.kind === 'kernel' ? 'PERFECT RUN' : 'PERFECT RACK'}: 100% online · grade S` : `${({ cable: 'Cable Mania', kernel: 'Kernel Snake' })[pz.kind] || 'Node Tetris'}: ${pct(pz.efficiency)} integrated · grade ${pz.grade || '?'}`) + bonus;
  const net = r.revenue - r.paidBurn;
  // Keep the headline legible at large scale. The disclosure below retains the exact ledger figures.
  const figure = (cents, sign = '') => {
    const exact = sign === 'net' ? signed(cents) : `${sign}${money(cents)}`;
    const compact = Math.abs(cents) >= 1_000_000;
    const shown = compact ? `${sign === 'net' ? cents > 0 ? '+' : cents === 0 ? '±' : '' : sign}${short(cents)}` : exact;
    return { exact, shown, compact };
  };
  const figures = [
    ['Revenue in', figure(r.revenue, '+'), 'pos'],
    ['Burn out', figure(r.paidBurn, '−'), 'neg'],
    ['Net', figure(net, 'net'), net >= 0 ? 'pos' : 'neg'],
    ...(r.raised ? [['Cash raised', figure(r.raised, '+'), 'pos']] : []),
    ...(r.inKind ? [['Compute, not cash', { exact: money(r.inKind), shown: short(r.inKind), compact: true }, '']] : [])
  ];
  const flow = figures.map(([label, amount, tone]) => `<p class="${label === 'Net' ? 'bu-net' : ''}"><span>${label}</span><b class="${tone}" aria-label="${esc(amount.exact)}" title="${esc(amount.exact)}">${esc(amount.shown)}</b></p>`).join('');
  const exactFlow = figures.some(([, amount]) => amount.compact)
    ? `<details class="bu-exact"><summary>Exact figures</summary><dl>${figures.map(([label, amount]) => `<div><dt>${label}</dt><dd>${esc(amount.exact)}</dd></div>`).join('')}</dl></details>` : '';
  return { title: `Round ${r.q} · board update`, role: 'report', desk: 'news', exit: null,
    body: `<div class="desk-center"><article class="board-sheet mat-paper ${r.breakthrough ? 'is-boom' : ''}"><header class="news-mast"><span>${esc(c.name.toUpperCase())}</span><b>BOARD UPDATE · R${r.q}</b></header>` +
      `<div class="bu-flow">${flow}</div>${exactFlow}` +
      scenarioReportLines(r) +
      (r.capex ? `<p class="bu-expired"><span>Expansion &amp; hiring capital</span><b>${money(r.capex)}</b></p>` : '') +
      (r.research ? `<p class="bu-expired"><span>Frontier capital spent</span><b>${money(r.research)}</b></p>` : '') +
      (r.moonshot?.startedQ && (!r.moonshot.endedQ || r.moonshot.endedQ === r.q) ? `<p class="frontier-outcome">Frontier: ${esc(r.moonshot.outcome || r.moonshot.state)}${r.moonshot.outcome === 'setback' ? ' · remediation +$250k/round for the next two rounds, through R5' : ''}</p>` : '') +
      worldNews(g, r) +
      (r.exec && items.length ? `<p class="bu-exec"><b>FAST CLOSE · +${pct(r.exec)} OUTCOME QUALITY</b></p>` : '') +
      (items.length ? `<ol class="bu-builds">${items.slice(0,3).join('')}</ol>${items.length>3 ? `<details><summary>${items.length-3} more builds</summary><ol class="bu-builds">${items.slice(3).join('')}</ol></details>` : ''}` : '<p class="bu-quiet">No builds this round.</p>') +
      (intLines ? `<details><summary>${esc(pzLine || 'Integration completed')}</summary><ul class="bu-integ">${intLines}</ul></details>` : '') +
      (r.expiredQty ? `<p class="bu-expired"><span>Expired unbuilt</span><b>${plural(r.expiredQty, 'GPU')}</b><small>${money(r.expiredCost)} already paid</small></p>` : '') +
      (r.prepaid ? `<p class="bu-expired"><span>Prepaid earlier</span><b>${money(r.prepaid)}</b></p>` : '') +
      `<p class="bu-value"><span>Valuation</span><b>${short(r.valueBefore)}</b><i aria-hidden="true">→</i><b class="${r.value >= r.valueBefore ? 'pos' : 'neg'}">${short(r.value)}</b><span class="bu-own">You own <b>${pctOf(r.founderPct)}</b></span></p>` +
      
      `<p class="news-next"><span>Next</span><b>R${g.q} · ${esc(phaseName(g.q))}</b><em class="bu-event kind-${esc(next.kind)}">${esc(next.text)}</em></p></article></div>`,
    footer: button('restart-review', 'New run', 'class="mat-exit rail-quiet"') + (g.world?.memo ? '<span class="rail-fact">Answer the board first</span>' : `<span class="round-progress">${g.q<=5?`Round ${g.q} of 5`:`Bonus Round ${g.q} · maximum 10`}</span>`+moveOn('next', `Start Round ${g.q}`)) };
}
// The world on the board update: this round's news, and at most one decision for the founder.
function worldNews(g, r) {
  const items = (r.world?.news || []).filter(n => n.when === 'bell' || n.size !== 'flavor');
  const critical = items.filter(n => n.when === 'bell' && (n.tone === 'bad' || n.size === 'major'));
  const secondary = items.filter(n => !critical.includes(n));
  const newsLine = n => `<p class="bu-news tone-${esc(n.tone)} size-${esc(n.size)}"><b>${esc(n.headline)}</b></p>`;
  const m = g.world?.memo && g.world.memo.q === r.q ? g.world.memo : null;
  if (!items.length && !m) return '';
  return `<section class="bu-world" aria-label="News">${critical.map(newsLine).join('')}${secondary.length ? `<details><summary>Market notes (${secondary.length})</summary>${secondary.map(newsLine).join('')}</details>` : ''}` +
    (m ? `<div class="bu-memo" role="group" aria-label="${esc(m.prompt)}"><p class="bu-memo-q">${esc(m.prompt)}</p><div class="bu-memo-opts">${m.options.map((o, i) => button('memo', `<b>${esc(o.label)}</b>${o.note ? `<small>${esc(o.note)}</small>` : ''}`, `class="mat-chip memo-opt" data-i="${i}"${i === 0 ? ' data-autofocus' : ''}`)).join('')}</div></div>` : '') + '</section>';
}

// ---- The exit: the founder payout and the story of the company ---------------------------------
// The choices that shaped the company: every raise, every training run, the first product and
// the first rack, in round order; the rest is counted, not listed.
function keyChoices(g) {
  const c = g.company, list = [], first = lane => c.builds.find(b => b.lane === lane);
  for (const b of c.builds) if (b.lane === 'research' || b === first('product') || b === first('infra'))
    list.push({ q: b.q, text: `${b.lane === 'research' ? 'Trained' : 'Built'} ${b.name}${b.result ? ` · ${runText(b.result).toLowerCase()}` : ''}` });
  for (const i of c.shares.investors) list.push({ q: i.q, text: investorChoice(i) });
  list.push(...scenarioChoices(g));
  list.sort((x, y) => x.q - y.q);
  const n = lane => c.builds.filter(b => b.lane === lane).length;
  return { list, summary: c.builds.length ? `${plural(c.builds.length, 'build')}: ${plural(n('product'), 'product')}, ${plural(n('infra'), 'rack')}, ${plural(n('research'), 'training run')}, ${plural(n('opportunity'), 'opportunity', 'opportunities')} won` : '' };
}
// One cap-table entry as a final-board line. Leadership grants (V10.17 hires) store shares but no
// percentage: the grant is the hire's newly issued equity (HIRES), never a cash raise.
export function investorChoice(i) {
  if (i.kind === 'leadership') { const h = HIRES.find(x => x.name === i.name); return h ? `Granted ${bpsText(h.equity)} to ${i.name} (leadership hire)` : `Equity grant to ${i.name} (leadership hire)`; }
  if (i.kind === 'talent') return `Granted ${bpsText(i.pct)} to ${i.name}`;
  return i.inKind ? `Compute ${money(i.inKind)} from ${i.name} for ${bpsText(i.pct)}` : `Cash ${money(i.paid)} from ${i.name} for ${bpsText(i.pct)}`;
}
function capTable(g) {
  const c = g.company, total = totalShares(c), funds = new Map();
  // One row per investor: a fund that signed twice holds the sum of both rounds.
  for (const i of c.shares.investors) { const f = funds.get(i.name) || { name: i.name, shares: 0, paid: 0, grant: false }; f.shares += i.shares; f.paid += i.paid; f.grant ||= i.kind === 'talent' || i.kind === 'leadership'; funds.set(i.name, f); }
  const rows = [{ name: 'You (founder)', pct: c.shares.founder / total, cls: 'is-you' }, ...[...funds.values()].map(f => ({ name: f.name, pct: f.shares / total, paid: f.paid, grant: f.grant }))];
  return `<table class="cap-table"><caption>Cap table</caption><tbody>${rows.map(r => `<tr class="${r.cls || ''}"><th scope="row">${esc(r.name)}</th><td>${pctOf(r.pct)}</td><td>${r.paid ? `paid ${short(r.paid)}` : r.grant ? 'equity grant' : ''}</td></tr>`).join('')}</tbody></table>`;
}
function finalView(g, ui = {}) {
  const a = g.arcade, x = a.exit, c = g.company, s = companyStats(g), shut = x.kind === 'shutdown', sold = x.kind === 'acquired', r = a.history.at(-1);
  const racks = rackOutput(c), { list: choices, summary } = keyChoices(g);
  const share = shareCopy(g);
  let preview = '';
  if (typeof document !== 'undefined') try { preview = `<img class="final-scorecard-preview" src="${scorecardDataUrl(g)}" width="1200" height="630" alt="Scorecard showing ${esc(c.name)} total bag ${esc(short(x.payout))}, ${esc(resultLabel(g))}">`; } catch { /* Sharing text and links still work if canvas is unavailable. */ }
  const shared = `<div class="final-shared"><textarea rows="3" readonly aria-label="Approved share caption">${esc(share.caption)}</textarea>${button('copy-caption', 'Copy caption', 'class="mat-exit"')}<small role="status">${esc(ui.shared?.status || '')}</small></div>`;
  const story = shut
    ? `<p class="final-note">Payroll missed in round ${r.q}: the bell asked for ${money(r.burn)} and the company had ${money(r.paidBurn)} after revenue. ${esc(c.name)} shut down and the equity is worthless.</p>`
    : `<p class="exit-story">${esc(c.name)} · ${esc(focusOf(c))} · model <b>${esc(MODEL_NAMES[c.level])}</b> · ${plural(s.products, 'product')}${racks.length ? ` · racks ${racks.map(([k, n]) => `+${n} ${k}`).join(' ')}/rd` : ''} · cash raised ${money(c.raised)}${a.ledger.inKind ? ` · compute backing ${short(a.ledger.inKind)}` : ''}</p>`;
  const mods = (g.world?.exitMods || []).filter(m => !shut && m.mult !== 1).map(m => `${{ war: 'Bidding war', strategic: 'Strategic interest', distressed: 'Distressed sale', anchor: 'Cirrostrata anchor live', 'sovereign-missed': 'Aster milestone missed' }[m.mod] || m.mod} × ${m.mult.toFixed(2)}`);
  const math = shut ? '' : x.parts ? partsTable(x, sold, mods) : sold ? `<p class="exit-math"><span>Sale price <b>${short(x.price)}</b></span><span>agreed in round <b>${x.round}</b></span><span>includes company cash <b>${short(x.cash)}</b></span><small>Paper mark that day: cash ${short(x.cash)} + EV ${short(x.ev)}. The buyer assumed every contract.</small></p>`
    : `<p class="exit-math"><span>Cash <b>${short(x.cash)}</b></span><span>+ EV <b>${short(x.ev)}</b> × market <b>${x.market.toFixed(2)}</b></span><span>= equity <b>${short(x.equity)}</b></span>${mods.length ? `<small>market ${x.baseMarket.toFixed(2)} · ${esc(mods.join(' · '))}</small>` : ''}</p>`;
  const title = shut ? 'Shut down' : x.epilogue?.title || x.title;
  const amounts=resultAmounts(g),basis=amounts.retained>0 ? `${money(amounts.realized)} cash proceeds + ${money(amounts.retained)} retained equity value` : `${money(amounts.realized)} cash proceeds`;
  const voluntary=a.extension?.decisions?.at(-1)?.choice==='finish';
  const finishNote = !sold && !shut ? note(`A complete ${resultRounds(g)}-round run. ${voluntary ? 'You chose to finish here.' : 'Your company’s final result is yours to share.'}`) : '';

  const epi = x.epilogue ? `<p class="exit-epilogue">${esc(x.epilogue.line)}</p>` : '';
  return { title: shut ? 'The company shut down' : 'Your total bag', role: 'report', desk: 'final', exit: null,
    body: `<div class="desk-center"><article class="final-sheet exit-sheet mat-paper ${shut ? 'is-shutdown' : 'is-up'} kind-${esc(x.kind)}">${paperHead(`<span class="wide">HSC · </span>FINAL BOARD · SEED ${g.seed}`, 'FINAL RESULT')}` +
      `<img class="final-lockup" src="brand/logo/hsc-lockup-ink.svg" width="148" height="52" alt="Haight Street Compute"><p class="company-identity">${esc(g.company.name)}</p><strong class="exit-title">${esc(title)}</strong>${title !== x.title && !shut ? `<p class="exit-mark">${esc(x.title)}</p>` : ''}${x.mark ? '<p class="exit-mark">Retained shares are paper value at the final mark</p>' : ''}${epi}` +
      `<p class="final-label">TOTAL BAG</p><strong class="final-cash money-hero" style="--chars:${short(x.payout).length}" data-fx-payoff>${shut ? money(x.payout) : short(x.payout)}</strong><p class="final-rounds">${esc(resultLabel(g))}</p><p class="final-basis">${esc(basis)}</p>` +
      `<p class="final-vs"><span>${pctOf(x.founderPct)} of</span><b>${short(shut ? Math.max(0, x.cash) : x.equity)}</b><span>${shut ? 'remaining cash' : sold ? 'the sale price' : 'equity value'}</span></p>${button('view-scorecard', 'VIEW SCORECARD ↓', 'class="final-jump"')}` + personalBest(g, ui.best) + finishNote + math + story +
      `<div class="exit-cols">${capTable(g)}${choices.length ? `<ol class="exit-choices" aria-label="Key choices">${choices.slice(0, 7).map(k => `<li><i>R${k.q}</i>${esc(k.text)}</li>`).join('')}${choices.length > 7 ? `<li class="more">+${choices.length - 7} more key choices</li>` : ''}${summary ? `<li class="more">${esc(summary)}</li>` : ''}</ol>` : '<p class="exit-choices is-none">No builds and no raises.</p>'}</div>` +
      `<section class="final-share-group" aria-label="Share your total bag"><p class="game-maker">Made by <a href="https://hscompute.com" target="_blank" rel="noopener noreferrer">Haight Street Compute · About the event ↗</a></p><h3>SHARE YOUR BAG</h3>${preview}<div class="final-share-row">${button('share-x', 'Share on X', 'class="mat-exit final-share"')}${button('share-linkedin', 'Share on LinkedIn', 'class="mat-exit final-share"')}${button('download-scorecard', 'Download Scorecard', 'class="mat-exit final-share"')}${button('copy-challenge', 'Copy Challenge Link', 'class="mat-exit final-share"')}${typeof navigator !== 'undefined' && navigator.share ? button('native-share', 'Share…', 'class="mat-exit final-share"') : ''}</div>${shared}</section></article></div>`,
    footer: button('replay-seed', `Replay seed ${esc(String(g.seed))}`, `class="mat-exit rail-quiet" data-seed="${esc(String(g.seed))}" aria-label="Replay this exact market, seed ${esc(String(g.seed))}"`) + button('new-market', `New market <span aria-hidden="true">→</span>`, 'class="mat-move rail-commit" data-primary aria-label="Play again on a fresh market"') };
}
// V10.17.3: what the company was worth, component by component, down to the founder's payout. The four
// components sum to EV; EV × market + cash = equity; founder % × equity = payout (exact, in cents).
const PARTS = [['products', 'Products'], ['research', 'Research & IP'], ['infra', 'Infrastructure'], ['contracts', 'Contracts']];
function partsTable(x, sold, mods) {
  const p = x.parts, row = (label, value, cls = '') => `<tr class="${cls}"><th scope="row">${label}</th><td>${value}</td></tr>`;
  const tail = sold ? row(`Sale price<small>R${x.round} · includes cash</small>`, short(x.price), 'is-sum')
    : row(`× market ${x.market.toFixed(2)}${mods.length ? `<small>${esc(mods.join(' · '))}</small>` : ''}`, short(x.evx), 'is-sum') + row('+ Cash', short(x.cash));
  return `<table class="exit-parts"><caption>${sold ? 'Paper mark that day' : 'What you built'}</caption><tbody>` +
    PARTS.map(([k, label]) => row(label, p[k] > 0 ? short(p[k]) : '—', p[k] > 0 ? '' : 'is-zero')).join('') + tail +
    row(`Ownership ${pctOf(x.founderPct)}`, short(x.payout), 'is-pay') + (x.realized !== undefined ? row('Realized proceeds', short(x.realized)) + row(`Retained equity ${pctOf(x.remainingOwnership)}`, short(x.retained)) : '') + '</tbody></table>';
}
// Local best only (this browser, this version): never a leaderboard.
function personalBest(g, best) {
  if (!best) return '';
  const f = g.arcade.finalScore, mine = best.payout === f.payout && best.seed === g.seed && best.rounds === resultRounds(g);
  return mine ? `<p class="final-pb is-new"><b>PERSONAL BEST</b>${best.prev != null ? `<span>previous best ${short(best.prev)}</span>` : ''}</p>`
    : `<p class="final-pb"><span>Your biggest bag</span><b>${short(best.payout)}</b><span>over ${best.rounds} rounds</span>${Number.isSafeInteger(best.seed) ? `<span>seed ${esc(String(best.seed))}</span>` : ''}</p>`;
}

export function dealView(g, ui = {}) {
  const a = g.arcade, c = a.confirm;
  if (c?.restart) return { title: 'Start a fresh company?', role: 'report', desk: 'paper', exit: null, body: paper(note('This replaces your current V21 run: its company, cash and cap table reset.') + stampLine('restart', 'START FRESH')), footer: close('Keep this run') };
  if (g.phase === 'extension') return extensionView(g);
  if (g.phase === 'over') return finalView(g, ui);
  if (g.phase === 'integration') return integrationView(g, ui);
  if (g.phase !== 'floor') return reportView(g);
  if (a.signing) return contractView(g, a.signing);
  if (c?.receipt) return receiptView(g, c.receipt);
  if (c?.built) return builtView(g, ui);
  if (c?.finish) return bellView(g);
  if (a.active) return supplierView(g, ui);
  if (c?.buyerId) return buyerView(g, ui);
  if (c?.termId) return termView(g, ui);
  if (c?.moonshot) return moonshotView(g);
  if (c?.scenario) return scenarioView(g);
  if (ui.panel === 'card') return cardDeskView(g, ui);
  return null;
}
