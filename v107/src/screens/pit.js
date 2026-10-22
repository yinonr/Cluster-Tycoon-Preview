// V10.7 The Living World: the controller. Every mutation goes through store.act (one atomic, saved
// engine step); the page re-renders from authoritative state and pit-fx animates what changed.
// Reading any desk pauses the floor: the 250ms ticker only advances with no desk or overlay open.
import { parseRate, stepRate, formatRate } from '../ui/offers.js';
import { stage, focusFrame, directoryView } from '../ui/pit-stage.js';
import * as deals from '../ui/pit-deals.js';
import { compact } from '../ui/pit-company.js';
import * as transactions from '../tycoon/pit-transactions.js';
import { arcadeStore } from '../tycoon/arcade-store.js';
import { V7, advance, available, activeLot, cents, claim, leave, haggle, closeQuarter, openQuarter } from '../tycoon/arcade.js';
import { buyerLive, reviewBuyer, counterBuyer } from '../tycoon/arcade-buyers.js';
import { prepareSigning, signTrade } from '../tycoon/arcade-signing.js';
import { liveTerm, reviewTerm, counterTerm, declineTerm, playRivalTerm } from '../tycoon/investors.js';
import { chooseMemo } from '../tycoon/world.js';
import { reserve, release, fill, heldFor, freeOf, openCards } from '../tycoon/founder.js';
import { startRizz, resolveRizz, recoverRizz, markerAt } from '../tycoon/rizz.js';
import { playRival } from '../tycoon/arcade-negotiation.js';
import { short } from '../ui/pit-ledger.js';
import { createAudio } from '../audio.js';
import * as fx from '../ui/pit-fx.js';
import { esc, newSeed } from '../util.js';
import { attachTetris, handleTetrisAction } from './tetris-input.js';
import office from './office.js';
import { createArcade } from '../tycoon/arcade.js';
import { nameError, renameStartup } from '../tycoon/startup-name.js';
import { guidePreferences, nextTip, foundingView, TIPS } from '../ui/founding.js';

const root = document.querySelector('#pit');
let storage; try { storage = localStorage; } catch { storage = { getItem() { throw Error('Storage blocked'); } }; }
const store = arcadeStore(storage);
if (store.state) store.act(recoverRizz);
const ui = { panel: 'floor', marketFilter: 'all', gpu: null, page: 0, cardId: null };
const prefs = guidePreferences(storage);
ui.entry = store.state || store.error ? null : prefs.intro ? 'found' : 'intro';
let officeCleanup = null, introReturn = null;
let sound = null, last = performance.now(), paintKey = '', returnFocus = null, meterFrame = 0, meterKey = null, meterStart = 0;

// The local best lives under its own versioned key; storage may be blocked, so every access is guarded.
const BEST = 'hsc-tycoon-v107-best';
function bestScore(g) {
  const f = g?.phase === 'over' && g.arcade.finalScore;
  if (!f) return null;
  // A shutdown is never a personal best; it only shows the best exit so far.
  if (f.kind === 'shutdown') { try { return JSON.parse(storage.getItem(BEST) || 'null'); } catch { return null; } }
  let best = null; try { best = JSON.parse(storage.getItem(BEST) || 'null'); } catch { return null; }
  if (!best || !Number.isSafeInteger(best.payout) || f.payout > best.payout) {
    const next = { payout: f.payout, seed: g.seed, prev: Number.isSafeInteger(best?.payout) ? best.payout : null };
    try { storage.setItem(BEST, JSON.stringify(next)); } catch { return null; }
    return next;
  }
  return best;
}
const seed = () => { const s = new URLSearchParams(location.search).get('seed'); return s && /^\d+$/.test(s) ? Number(s) >>> 0 : newSeed(); };
// Every player action re-renders from authoritative state, then the room answers what changed.
const act = fn => { const before = fx.snapshot(store.state), ok = store.act(fn); if (ok || store.error) render(); if (ok) fx.play(root, fx.effects(before, fx.snapshot(store.state)), sound); return ok; };
const controls = () => [...root.querySelectorAll('.pit-focus button:not(:disabled),.pit-focus input:not(:disabled),.pit-focus select:not(:disabled),.pit-focus summary,.pit-focus textarea')].filter(e => e.getClientRects().length && !e.closest('details:not([open]) > :not(summary)'));
function remember(el) {
  if (!el?.dataset?.action) return null;
  return [`[data-action="${CSS.escape(el.dataset.action)}"]`, ...['id', 'card', 'gpu', 'filter'].filter(k => el.dataset[k] !== undefined).map(k => `[data-${k}="${CSS.escape(el.dataset[k])}"]`)].join('');
}
function clearInputs() { for (const k of ['qty', 'counter', 'buyerCounter', 'termPct']) delete ui[k]; }
// A full re-render happens only when the set of live counterparties or cards changes.
const marketKey = g => [g.phase, g.q, g.arcade.lots.filter(l => available(g, l)).map(l => l.id).join(','), g.arcade.buyers.filter(b => buyerLive(g, b)).map(b => b.id).join(','),
  g.phase === 'floor' ? liveTerm(g)?.id || '' : '', g.phase === 'floor' ? openCards(g).map(o => o.id).join(',') : '', g.arcade.objectives.length].join(':');

function render() {
  cancelAnimationFrame(meterFrame);
  const focused = remember(document.activeElement), g = store.state;
  if (ui.entry === 'intro') {
    ui.guidanceOpen = true;
    if (!officeCleanup) {
      root.innerHTML = '<div class="original-opening"></div>';
      officeCleanup = office(root.firstElementChild, { audio: new Proxy({}, { get: (_, key) => (...args) => sound?.[key]?.(...args) }), go() {
        officeCleanup?.(); officeCleanup = null; prefs.intro = true; prefs.save();
        ui.entry = introReturn || (store.state ? null : 'found'); introReturn = null; render();
      } });
    }
    return;
  }
  if (store.error) { root.innerHTML = `<section class="pit-error"><h1>Trading paused</h1><p role="alert">${esc(store.error)}</p><p>Your saved run is preserved. Reload to resume from the latest valid state.</p></section>`; return; }
  if (!g) {
    ui.entry = 'found'; ui.guidanceOpen = true;
    root.innerHTML = `<div class="pit-background" inert>${stage(createArcade(seed()), ui)}</div>${foundingView(ui, prefs, null)}`;
    root.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
    return;
  }
  ui.guide ||= nextTip(g, ui, prefs);
  ui.guidanceOpen = !!(ui.entry || ui.guide);
  ui.best = bestScore(g);
  if (ui.panel === 'card' && !g.arcade.objectives.some(o => o.id === ui.cardId && o.status === 'open')) ui.panel = 'floor';
  const view = deals.dealView(g, ui) || (ui.panel === 'market' ? directoryView(g, ui) : null);
  ui.focusOpen = !!view; if (view) ui.memo = null;
  root.innerHTML = `<div class="pit-background">${stage(g, ui)}</div>${view ? focusFrame(g, view) : ''}<span class="pit-announcement" role="status" aria-live="polite">${g.arcade.message?.text ? esc(`${g.company.name}: ${g.arcade.message.text}`) : ''}</span>`;
  // The HUD stays live and uncovered during a desk; only the room and the board go inert.
  if (view) for (const el of root.querySelectorAll('.pit-background .pit-main')) { el.inert = true; el.setAttribute('aria-hidden', 'true'); }
  const focus = root.querySelector('.pit-focus');
  if (focus) {
    const same = focused && focus.querySelector(focused);
    // The meter, then the control you were using, then a verdict to read. Never auto-focus Bank.
    const target = root.querySelector('[data-action="stop-rizz"]') || (same && !same.disabled ? same : null) || root.querySelector('.pit-focus [data-autofocus]') || focus;
    target.focus({ preventScroll: true });
  } else if (returnFocus || focused) {
    // Desktop board and phone strip both carry card controls; return to the one on screen.
    const shown = sel => [...root.querySelectorAll(sel)].find(e => !e.disabled && e.getClientRects().length);
    (shown(returnFocus || focused) || shown('[data-action="open-market"][data-filter="all"]'))?.focus({ preventScroll: true });
    returnFocus = null;
  }
  paintKey = marketKey(g); last = performance.now();
  const l = activeLot(g), entry = l?.negotiation?.running && l.negotiation.attempts.at(-1);
  if (entry) {
    const key = l.id + ':' + l.negotiation.running; if (key !== meterKey) { meterKey = key; meterStart = performance.now(); }
    const marker = root.querySelector('.marker');
    const animate = now => { if (marker) marker.style.left = `${markerAt(entry.params, now - meterStart) * 100}%`; meterFrame = requestAnimationFrame(animate); };
    meterFrame = requestAnimationFrame(animate);
  } else meterKey = null;
  if (ui.guidanceOpen) {
    for (const el of root.children) { el.inert = true; el.setAttribute('aria-hidden', 'true'); }
    root.insertAdjacentHTML('beforeend', foundingView(ui, prefs, g));
    root.querySelector('.founding-dialog [data-autofocus]')?.focus({ preventScroll: true });
  }
}

function stopMeter() {
  const n = activeLot(store.state)?.negotiation, p = n?.running && n.attempts.at(-1).params;
  // STOP arms 450 ms after the meter starts, so a double press on PUSH can never land as a stop.
  if (!p || performance.now() - meterStart < 450) return false;
  return act(g => resolveRizz(g, markerAt(p, performance.now() - meterStart)));
}
function closeFocus() {
  const g = store.state; if (activeLot(g)?.negotiation.running) return;
  if (g.arcade.signing) { act(g => { g.arcade.signing = null; return true; }); return; }
  if (g.arcade.confirm?.receipt || g.arcade.confirm?.built) { postReceipt(); return; }
  ui.panel = 'floor'; clearInputs();
  if (g.arcade.active) act(leave); else if (g.arcade.confirm) act(g => { g.arcade.confirm = null; return true; }); else render();
  settleAtBell();
}
// Share a finished run as plain text with a seeded challenge link. No leaderboard, no backend.
function shareScore(g) {
  const x = g.arcade.exit; if (!x) return;
  let url = location.href; try { const u = new URL(location.href); u.search = `?seed=${g.seed}`; u.hash = ''; url = u.toString(); } catch { /* keep the page URL */ }
  const text = x.kind === 'shutdown' ? `My AI startup ${g.company.name} shut down in Cluster Tycoon: The Founder. Can you survive the same market? Seed ${g.seed}: ${url}`
    : `I took ${g.company.name} to a ${x.title.toLowerCase()} in Cluster Tycoon: The Founder. Founder payout ${short(x.payout)} for my ${(x.founderPct * 100).toFixed(1)}%. Same market, seed ${g.seed}: ${url}`;
  ui.shared = { text, status: 'ready' }; render(); // the text is on the paper at once, whatever the share sheet does
  const done = status => { ui.shared = { text, status }; render(); };
  try { if (navigator.share) { navigator.share({ title: 'Cluster Tycoon: The Founder', text, url }).then(() => done('shared'), () => done('ready')); return; } } catch { /* fall through */ }
  try { navigator.clipboard.writeText(text).then(() => done('copied'), () => done('ready')); return; } catch { /* fall through */ }
  done('ready');
}
function settleAtBell() { const g = store.state; if (g?.phase === 'floor' && g.arcade.time >= V7.seconds && !g.arcade.active && !g.arcade.confirm && !g.arcade.signing) act(closeQuarter); }
function postReceipt() { ui.panel = 'floor'; clearInputs(); act(transactions.postReceipt); settleAtBell(); }
function openPanel(panel) { const a = store.state.arcade; if (a.active || a.confirm || a.signing) return; ui.panel = panel; ui.page = 0; clearInputs(); render(); }
function fresh(s) { ui.pendingSeed = s; ui.entry = 'found'; ui.guide = null; ui.nameDraft = ''; ui.showInstructions = false; render(); }
function closeGuide() {
  if (TIPS[ui.guide]) { prefs.seen.add(ui.guide); prefs.save(); }
  if (!store.state && ui.entry === 'found') return;
  ui.guide = null; ui.entry = null; render();
}
root.addEventListener('submit', e => {
  if (e.target.id !== 'startup-form') return;
  e.preventDefault();
  if (nameError(ui.nameDraft)) return;
  if (ui.guide === 'rename') { store.act(g => renameStartup(g, ui.nameDraft)); ui.shared = null; }
  else {
    const ok = store.state ? store.restart(ui.pendingSeed ?? seed(), ui.nameDraft) : store.start(ui.pendingSeed ?? seed(), ui.nameDraft);
    if (!ok) { render(); return; }
    ui.panel = 'floor'; ui.cardId = null; ui.shared = null; clearInputs();
    prefs.founded = prefs.intro = true; prefs.save();
  }
  ui.guide = ui.entry = null; delete ui.pendingSeed; render();
});
root.addEventListener('input', e => {
  if (e.target.id !== 'startup-name') return;
  ui.nameDraft = e.target.value;
  const error = nameError(ui.nameDraft);
  root.querySelector('[form="startup-form"]').disabled = !!error;
  root.querySelector('#name-error').textContent = error;
  e.target.setAttribute('aria-invalid', String(!!error));
});

// Charm stops on the press itself; the click that press later synthesizes is swallowed once.
let swallowClick = false;
root.addEventListener('pointerdown', e => { swallowClick = false; const b = e.target.closest('[data-action="stop-rizz"]'); if (b && !b.disabled && e.button === 0) { swallowClick = true; e.preventDefault(); stopMeter(); } });
root.addEventListener('click', e => {
  if (swallowClick) { swallowClick = false; e.preventDefault(); return; }
  const b = e.target.closest('button[data-action]'); if (!b || b.disabled) return;
  const a = b.dataset.action, g = store.state, d = b.dataset;
  if (a === 'guide-close' || a === 'guide-dismiss') { closeGuide(); return; }
  if (a === 'guide-instructions') { ui.showInstructions = true; render(); return; }
  if (a === 'intro-replay') { introReturn = ui.entry; ui.guide = null; ui.entry = 'intro'; render(); return; }
  if (a === 'rename-startup') { ui.guide = 'rename'; ui.nameDraft = g.company.name; render(); return; }
  if (a === 'help') { if (activeLot(g)?.negotiation.running) return; ui.guide = 'help'; render(); return; }
  if (ui.guidanceOpen) return;
  if (a === 'start') { fresh(seed()); return; }
  if (a === 'sound') { sound = sound ? null : createAudio(); ui.sound = !!sound; render(); return; }
  if (!g || store.error) return;
  if (a.startsWith('tetris-')) { handleTetrisAction(a, d); return; } // Cluster Tetris owns its controls
  if (['focus-supplier', 'focus-buyer', 'review-term', 'open-card', 'open-market', 'finish-review'].includes(a) && !ui.focusOpen) returnFocus = remember(b);
  if (a === 'open-market') {
    if (g.arcade.active || g.arcade.signing || g.arcade.confirm?.receipt || g.arcade.confirm?.built) return;
    if (g.arcade.confirm) store.act(g => { g.arcade.confirm = null; return true; }); // leave a bid or term sheet open on the floor
    ui.marketFilter = ({ seller: 'supply', buyer: 'buyers' })[d.filter] || d.filter || 'all'; ui.gpu = d.gpu || null; openPanel('market');
  }
  else if (a === 'market-page') { ui.page = Math.max(0, ui.page + Number(d.step)); render(); }
  else if (a === 'open-card') { if (g.phase !== 'floor') return; ui.cardId = d.card; openPanel('card'); }
  else if (a === 'focus-supplier') { ui.panel = 'floor'; clearInputs(); act(g => claim(g, d.id)); }
  else if (a === 'focus-buyer') { ui.panel = 'floor'; clearInputs(); act(g => reviewBuyer(g, d.id)); }
  else if (a === 'review-term') { ui.panel = 'floor'; clearInputs(); act(g => { if (g.arcade.confirm?.termId && !g.arcade.signing) g.arcade.confirm = null; return reviewTerm(g, d.id); }); } // switching to a rival's sheet
  else if (a === 'play-rival-term') { delete ui.termPct; act(playRivalTerm); if (!store.state.arcade.confirm) { ui.panel = 'floor'; render(); } }
  else if (a === 'memo') act(g => chooseMemo(g, Number(d.i)));
  else if (a === 'step-offer') {
    const supplier = d.kind === 'supplier', input = root.querySelector(supplier ? '[data-counter]' : '[data-buyer-counter]');
    if (!input) return; const next = stepRate(input.value, Number(d.step), parseRate(input.min), parseRate(input.max));
    if (next !== null) { input.value = formatRate(next); paintInputs({ target: input }); }
  }
  else if (a === 'step-term') {
    const input = root.querySelector('[data-term-pct]'), bps = deals.parsePct(input?.value), max = Math.round(Number(input?.max) * 100);
    if (!input || bps === null) return; const next = Math.max(50, Math.min(max, bps + Number(d.step)));
    input.value = (next / 100).toFixed(next % 100 ? (next % 10 ? 2 : 1) : 0); paintInputs({ target: input });
  }
  else if (a === 'close-focus') closeFocus();
  else if (a === 'haggle') { const value = parseRate(root.querySelector('[data-counter]')?.value); if (!deals.supplierCounterPreview(g, value).valid) return; act(g => { if (!haggle(g, value)) return false; ui.counter = formatRate(activeLot(g).negotiation.price); return true; }); }
  else if (a === 'play-rival') act(g => { if (!playRival(g, d.id)) return false; ui.counter = formatRate(activeLot(g).negotiation.price); return true; });
  else if (a === 'explain-charm') { root.querySelector('[data-counter]')?.focus(); root.querySelector('[data-counter]')?.select(); }
  else if (a === 'start-rizz') act(startRizz);
  else if (a === 'stop-rizz') { if (e.detail === 0) stopMeter(); } // keyboard activation only; pointers stop on press
  else if (a === 'buy') { if (act(g => prepareSigning(g, 'purchase'))) sound?.printer(.2); }
  else if (a === 'sign-it') { sound?.scratch(.25); act(signTrade); }
  else if (a === 'cancel-sign') act(g => { g.arcade.signing = null; return true; });
  else if (a === 'post-receipt') postReceipt();
  else if (a === 'allocate') {
    // Phones go straight to that card's desk (BUILD is one tap away); desktops see it on the board.
    const id = d.card, prev = [ui.panel, ui.cardId];
    if (compact()) { ui.cardId = id; ui.panel = 'card'; } else ui.panel = 'floor';
    if (act(g => transactions.allocateFromReceipt(g, id))) settleAtBell(); else { [ui.panel, ui.cardId] = prev; render(); }
  }
  else if (a === 'reserve') {
    if (!freeOf(g, d.gpu)) { ui.marketFilter = 'supply'; ui.gpu = d.gpu; openPanel('market'); return; }
    act(g => reserve(g, d.card, d.gpu, 1));
  }
  else if (a === 'release') act(g => d.all ? release(g, d.card, null, heldFor(g, d.card)) : release(g, d.card, d.gpu, 1));
  else if (a === 'fill') act(g => fill(g, d.card));
  else if (a === 'build') {
    ui.openBefore = { ids: openCards(g).map(o => o.id) }; // so the BUILT moment can name the cards it dealt
    act(g => transactions.buildWithStamp(g, d.card));
  }
  else if (a === 'counter-buyer') { const rate = parseRate(root.querySelector('[data-buyer-counter]')?.value), qty = Number(root.querySelector('[data-sale-qty]')?.value); if (!deals.buyerCounterPreview(g, rate, qty).valid) return; ui.qty = qty; act(g => { if (!counterBuyer(g, rate, qty)) return false; ui.buyerCounter = formatRate(g.arcade.buyers.find(b => b.id === g.arcade.confirm.buyerId).rate); return true; }); }
  else if (a === 'sell-buyer') { const qty = Number(root.querySelector('[data-sale-qty]')?.value); act(g => prepareSigning(g, 'buyer', qty)); }
  else if (a === 'counter-term') { const bps = deals.parsePct(root.querySelector('[data-term-pct]')?.value); if (!deals.termCounterPreview(g, bps).valid) return; delete ui.termPct; act(g => counterTerm(g, bps)); if (!store.state.arcade.confirm) { ui.panel = 'floor'; render(); } }
  else if (a === 'accept-term') act(g => prepareSigning(g, 'term'));
  else if (a === 'decline-term') { ui.panel = 'floor'; clearInputs(); act(declineTerm); settleAtBell(); }
  else if (a === 'finish-review') act(g => { if (g.arcade.active || g.arcade.confirm || g.arcade.signing) return false; g.arcade.confirm = { finish: true }; return true; });
  else if (a === 'finish') { ui.panel = 'floor'; act(g => { g.arcade.confirm = null; return closeQuarter(g); }); }
  else if (a === 'next') { ui.panel = 'floor'; ui.cardId = null; clearInputs(); act(openQuarter); }
  else if (a === 'restart-review') act(g => { g.arcade.confirm = { restart: true }; return true; });
  else if (a === 'restart') fresh(seed());
  else if (a === 'replay-seed') { const s = Number(d.seed) >>> 0; fresh(s); try { history.replaceState(null, '', `?seed=${s}`); } catch { /* URL unchanged */ } render(); }
  else if (a === 'share-score') shareScore(g);
  else if (a === 'new-market') { if (g.phase !== 'over') return; try { history.replaceState(null, '', location.pathname); } catch { /* URL unchanged */ } fresh(newSeed()); }
});

// Partial repaint of live previews: rebuild a preview only when its markup changes (the blur
// 'change' that follows typing fires on the press of a rail button; replacing that button
// mid-click would swallow the click).
function paintInputs(e) {
  const g = store.state; if (!g) return;
  const input = e.target, bindings = { 'data-counter': 'counter', 'data-buyer-counter': 'buyerCounter', 'data-sale-qty': 'qty', 'data-term-pct': 'termPct' };
  for (const [attr, key] of Object.entries(bindings)) if (input.hasAttribute?.(attr)) ui[key] = input.value;
  const update = (selector, value) => { const el = root.querySelector(selector), html = value?.html ?? value ?? ''; if (el && el.dataset.painted !== html) { el.dataset.painted = html; el.innerHTML = html; } };
  const light = (action, valid) => { const b = root.querySelector(`[data-action="${action}"]`); if (b) { b.disabled = !valid; b.classList.toggle('is-lit', valid); } };
  if (input.matches('[data-counter]')) { const p = deals.supplierCounterPreview(g, parseRate(input.value)); update('[data-counter-total]', p); update('[data-counter-gap]', p.gap); update('[data-offer-label]', p.label); light('haggle', p.valid); }
  if (input.matches('[data-sale-qty],[data-buyer-counter]')) {
    const qty = Number(root.querySelector('[data-sale-qty]')?.value), rate = parseRate(root.querySelector('[data-buyer-counter]')?.value);
    update('[data-sale-math]', deals.buyerQuoteView(g, qty));
    const p = deals.buyerCounterPreview(g, rate, qty); update('[data-buyer-proposal]', p); update('[data-buyer-gap]', p.gap); update('[data-ask-label]', p.label); light('counter-buyer', p.valid);
    update('[data-buyer-actions]', deals.buyerActions(g, qty));
    if (Number.isSafeInteger(qty) && qty > 0) for (const k of root.querySelectorAll('[data-action="step-offer"][data-kind="buyer"]')) { const step = Math.abs(Number(k.dataset.step)), amount = deals.money(cents(qty, step)), hint = k.querySelector('small'); if (hint) hint.textContent = amount; k.setAttribute('aria-label', `${Number(k.dataset.step) < 0 ? 'Decrease' : 'Increase'} resale ask by ${step} cents, ${amount} on ${qty} GPUs`); }
  }
  if (input.matches('[data-term-pct]')) { const p = deals.termCounterPreview(g, deals.parsePct(input.value)); update('[data-term-total]', p); update('[data-term-own]', p.own); update('[data-term-label]', p.label); light('counter-term', p.valid); }
}
root.addEventListener('input', paintInputs); root.addEventListener('change', paintInputs);
document.addEventListener('keydown', e => {
  if (ui.guidanceOpen) {
    const dialog = root.querySelector('.founding-dialog');
    if (!dialog) return;
    if (e.key === 'Escape') { e.preventDefault(); closeGuide(); }
    if (e.key === 'Tab') {
      const all = [...dialog.querySelectorAll('button:not(:disabled),input')].filter(el => el.getClientRects().length);
      if (e.shiftKey && (document.activeElement === all[0] || document.activeElement === dialog)) { e.preventDefault(); all.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === all.at(-1)) { e.preventDefault(); all[0]?.focus(); }
    }
    return;
  }
  if (!root.querySelector('.pit-focus') || store.state?.phase === 'integration') return; // the puzzle owns its keys
  if (e.repeat && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return; }
  if ((e.key === ' ' || e.key === 'Enter') && activeLot(store.state)?.negotiation.running) { e.preventDefault(); if (!e.repeat) stopMeter(); return; }
  if (e.key === 'Escape') { e.preventDefault(); if (activeLot(store.state)?.negotiation.running) act(recoverRizz); else if (store.state?.phase === 'floor') closeFocus(); return; }
  if (e.key === 'Tab') { const all = controls(), first = all[0], end = all.at(-1); if (!all.length) return; if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('pit-focus'))) { e.preventDefault(); end.focus(); } else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); } }
});
// The floor clock: 250ms ticks while no desk or overlay is open.
setInterval(() => {
  const now = performance.now(), dt = (now - last) / 1000; last = now; const g = store.state;
  if (!g || ui.guidanceOpen || store.error || document.hidden || g.phase !== 'floor' || g.arcade.active || g.arcade.confirm || g.arcade.signing || ui.panel !== 'floor') return;
  const before = fx.snapshot(g); if (!store.act(g => advance(g, dt))) { if (store.error) render(); return; }
  const next = store.state;
  if (marketKey(next) !== paintKey) { render(); fx.play(root, fx.effects(before, fx.snapshot(next)).filter(e => e.type === 'arrival' || e.type === 'cash' || e.type === 'valuation'), sound); return; }
  for (const el of root.querySelectorAll('[data-floor-clock]')) el.textContent = `${Math.ceil(V7.seconds - next.arcade.time)}s`;
  for (const el of root.querySelectorAll('[data-station-until]')) { const until = Number(el.dataset.stationUntil), at = Number(el.dataset.stationAt || 0), left = Math.max(0, until - next.arcade.time); el.textContent = `${Math.ceil(left)}s`; el.closest('[data-fuse]')?.style.setProperty('--left', String(Math.min(1, left / Math.max(1, until - at)))); el.closest('[data-fuse]')?.classList.toggle('is-short', left < 8); }
}, 250);
window.addEventListener('storage', e => { if (e.key === V7.key) { store.act(() => true); render(); } });
attachTetris({ root, store, act, render, ui, sound: () => sound });
render();
