// V10.14 The World Gets Bigger: the controller. Every mutation goes through store.act (one atomic, saved
// engine step); the page re-renders from authoritative state and pit-fx animates what changed.
// Reading any desk pauses the floor: the 250ms ticker only advances with no desk or overlay open.
import { startWorkshop } from '../tycoon/integration.js';
import { parseRate, stepRate, formatRate } from '../ui/offers.js';
import { stage, focusFrame, directoryView, utilityView } from '../ui/pit-stage.js';
import * as deals from '../ui/pit-deals.js';
import * as transactions from '../tycoon/pit-transactions.js';
import { arcadeStore } from '../tycoon/arcade-store.js';
import { trainingStore, TRAINING_KEY } from '../tycoon/training-store.js';
import { trainingMutate, trainingAction, trainingHandoffStatus } from '../tycoon/training.js';
import { taskViewStore, selectTaskContext } from '../tycoon/task-navigation.js';
import { stableOfferSeats } from '../tycoon/pit-layout-state.js';
import { minigameEligibility } from '../tycoon/replay-access.js';
import { trainingStage, trainingGuidance } from '../ui/training.js';
import { selectBaburExpression, attachBaburArtFallback } from '../ui/babur.js';
import { V7, advance, available, activeLot, cents, claim, leave, haggle, closeQuarter, openQuarter } from '../tycoon/arcade.js';
import { buyerLive, reviewBuyer, counterBuyer } from '../tycoon/arcade-buyers.js';
import { prepareSigning, signTrade } from '../tycoon/arcade-signing.js';
import { liveTerm, reviewTerm, counterTerm, declineTerm, playRivalTerm, maybeVulture } from '../tycoon/investors.js';
import { chooseMemo } from '../tycoon/world.js';
import { reviewMoonshot, acceptMoonshot, declineMoonshot } from '../tycoon/moonshot.js';
import { reviewScenario, liveOffers, cureStage } from '../tycoon/scenarios.js';
import { decideScenario, sourceBlock } from '../tycoon/arcade.js';
import { reserve, release, fill, heldFor, freeOf, openCards } from '../tycoon/founder.js';
import { startRizz, resolveRizz, recoverRizz, markerAt, charmActor } from '../tycoon/desk-charm.js';
import { buyerCharmView } from '../ui/buyer-charm.js';
import { playRival } from '../tycoon/arcade-negotiation.js';
import { short } from '../ui/pit-ledger.js';
import { challengeUrl, shareCopy, scorecardDataUrl, scorecardFile, scorecardReady } from '../ui/scorecard.js';
import { createAudio } from '../audio.js';
import * as fx from '../ui/pit-fx.js';
import { esc, newSeed } from '../util.js';
import { attachTetris, handleTetrisAction } from './tetris-input.js';
import { attachArcade, handleArcadeAction } from './arcade-input.js';
import office from './office.js';
import { createArcade } from '../tycoon/arcade.js';
import { nameError, renameStartup } from '../tycoon/startup-name.js';
import { guidePreferences, foundingView, hintView, TIPS } from '../ui/founding.js';
import { FIGURE_DEFS } from '../ui/character.js';

const root = document.querySelector('#pit');
attachBaburArtFallback(root);
// HSC design pass: the 1-bit figure patterns live once in the page, outside the re-rendered root.
if (!document.querySelector('.hsc-figure-defs')) document.body.insertAdjacentHTML('afterbegin', FIGURE_DEFS);
let storage; try { storage = localStorage; } catch { storage = { getItem() { throw Error('Storage blocked'); } }; }
const campaign = arcadeStore(storage);
const training = trainingStore(storage);
const taskView = taskViewStore(storage);
// Input controllers use the same engine callbacks against the active company.
// A lesson can never write the campaign record, even when replayed mid-round.
const store = {
  get state() { return training.state?.practice || campaign.state; },
  get error() { return campaign.error || (training.state ? training.error : '') || ui.handoffError || ''; },
  act(fn) { return training.state ? training.act(t => trainingMutate(t, fn)) : campaign.act(fn); },
};
if (campaign.state && !training.state) campaign.act(recoverRizz);
const ui = { panel: 'floor', marketFilter: 'all', gpu: null, page: 0, cardId: null,taskId:null,taskLane:null,floorGpu:null,floorNeed:0,floorPage:0 };
const prefs = guidePreferences(storage);
ui.entry = store.state || store.error ? null : 'found';
ui.nameDraft = 'My AI Startup';
// HSC design pass: the scorecard draws with self-hosted fonts and the original lockup; redraw once they are ready.
scorecardReady.then(() => { if (store.state?.phase === 'over' && !officeCleanup) render(); });
let officeCleanup = null, introReturn = null, introInputUntil = 0;
for (const type of ['pointerdown', 'click', 'keydown', 'keyup']) root.addEventListener(type, e => {
  if (performance.now() < introInputUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
let sound = prefs.sound === true ? createAudio() : null, last = performance.now(), paintKey = '', returnFocus = null, meterFrame = 0, meterKey = null, meterStart = 0;
ui.sound = !!sound;

// The local best lives under its own versioned key; storage may be blocked, so every access is guarded.
const BEST = `${V7.key}-best`;
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
const urlSeed = () => { const s = new URLSearchParams(location.search).get('seed'); const n = Number(s); return s && /^\d+$/.test(s) && Number.isSafeInteger(n) && n <= 0xffffffff ? n : null; };
const seed = () => urlSeed() ?? newSeed();
// Every player action re-renders from authoritative state, then the room answers what changed.
const act = fn => {
  const before = fx.snapshot(store.state), workshop=store.state?.arcade.workshop, ok = store.act(fn);
  if (ok && workshop && store.state?.phase==='report' && !store.state.arcade.workshop) {
    ui.panel='floor';
    returnFocus=`[data-action="workshop"][data-kind="${workshop.kind}"]`;
  }
  if (ok || store.error) render();
  if (ok) fx.play(root, fx.effects(before, fx.snapshot(store.state)), sound);
  return ok;
};
const controls = () => [...root.querySelectorAll('.pit-focus button:not(:disabled),.pit-focus input:not(:disabled),.pit-focus select:not(:disabled),.pit-focus summary,.pit-focus textarea')].filter(e => e.getClientRects().length && !e.closest('details:not([open]) > :not(summary)'));
function remember(el) {
  if (!el?.dataset?.action) return null;
  return [`[data-action="${CSS.escape(el.dataset.action)}"]`, ...['id', 'card', 'gpu', 'filter','kind','step'].filter(k => el.dataset[k] !== undefined).map(k => `[data-${k}="${CSS.escape(el.dataset[k])}"]`)].join('');
}
function clearInputs() { for (const k of ['qty', 'counter', 'buyerCounter', 'termPct']) delete ui[k]; }
// A full re-render happens only when the set of live counterparties or cards changes.
const marketKey = g => [g.phase, g.q, g.arcade.lots.filter(l => available(g, l)).map(l => l.id).join(','), g.arcade.buyers.filter(b => buyerLive(g, b)).map(b => b.id).join(','), liveOffers(g).map(o => o.id).join(','),
  g.phase === 'floor' ? liveTerm(g)?.id || '' : '', g.phase === 'floor' ? openCards(g).map(o => o.id).join(',') : '', g.arcade.objectives.length].join(':');

function render() {
  cancelAnimationFrame(meterFrame);
  const focused = remember(document.activeElement), g = store.state;
  // Name-first opening and untimed sticky note lead directly to the saved lesson.
  if (!store.error && (ui.entry === 'intro' || ui.entry === 'found')) {
    ui.guidanceOpen = true;
    if (!officeCleanup) {
      if (prefs.sound !== false && !sound) { sound = createAudio(); ui.sound = true; } // the site's default: SOUND ON
      root.innerHTML = '<div class="original-opening"></div>';
      officeCleanup = office(root.firstElementChild, {
        audio: new Proxy({}, { get: (_, key) => (...args) => sound?.[key]?.(...args) }),
        name: () => ui.entry === 'found' ? training.state?.name || null : g?.company.name || null,
        story: true, training: true,
        sound: { get on() { return !!sound; }, set(on) { if (on && !sound) sound = createAudio(); if (!on) { sound?.cutChorus?.(); sound = null; } ui.sound = !!sound; prefs.sound = !!sound; prefs.save(); } },
        motion: { get on() { return prefs.motion ?? !matchMedia('(prefers-reduced-motion: reduce)').matches; }, set(on) { prefs.motion = !!on; prefs.save(); } },
        found(name) {
          const error = nameError(name); if (error) return error;
          if (!training.begin(ui.pendingSeed ?? seed(), name)) return training.error || 'This lesson could not start.';
          ui.panel = 'floor'; ui.cardId = null; ui.shared = null; clearInputs(); delete ui.pendingSeed;
          prefs.founded = true; prefs.save(); return true;
        },
        done() {
          officeCleanup?.(); officeCleanup = null; prefs.intro = true; prefs.save();
          introInputUntil = performance.now() + 650;
          prefs.welcome = true; prefs.save();
          ui.entry = introReturn; introReturn = null; render();
        },
      });
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
  ui.training = training.state;
  if (!training.state) {
    const deck=taskView.read(g);
    if (deck.card) taskView.choose(g,deck.card.id);
    ui.taskId=deck.card?.id || null;ui.taskLane=deck.card?.lane || null;ui.taskRound=g.q;
  }
  ui.trainingCanSkip = training.completed || !!campaign.state;
  ui.hint = null; // Babur teaches actions in training; later guidance is available through Help.
  if (ui.hint) { prefs.seen.add(ui.hint); prefs.save(); }
  ui.guidanceOpen = !!(ui.entry || ui.guide);
  ui.best = training.state ? null : bestScore(g);
  if (ui.panel === 'card' && !g.arcade.objectives.some(o => o.id === ui.cardId)) ui.panel = 'floor';
  const view = deals.dealView(g, ui) || (ui.panel === 'market' ? directoryView(g, ui) : utilityView(g, ui));
  if (view && training.state) {
    view.guidance = trainingGuidance(training.state);
    view.baburExpression = selectBaburExpression(training.state, { context: 'focus', game: g, view });
  }
  ui.focusOpen = !!view; if (view) ui.memo = null;
  const challenge = !training.state && new URLSearchParams(location.search).get('challenge') === '1' && urlSeed() !== null && !ui.challengeDismissed && ui.entry !== 'found';
  root.innerHTML = `<div class="pit-background">${training.state ? trainingStage(training.state, ui) : stage(g, ui)}</div>${view && !ui.guidanceOpen ? focusFrame(g, view) : ''}${challenge ? `<aside class="challenge-invite" role="note">Challenge seed ${urlSeed()} is ready. <button type="button" data-action="start-challenge">Start a fresh challenge</button><button type="button" data-action="dismiss-challenge" aria-label="Dismiss challenge notice">×</button></aside>` : ''}<span class="pit-announcement" role="status" aria-live="polite">${!training.state && g.arcade.message?.text ? esc(`${g.company.name}: ${g.arcade.message.text}`) : ''}</span>`;
  // The HUD stays live and uncovered during a desk; only the room and the board go inert.
  if (view) for (const el of root.querySelectorAll('.pit-background .pit-main')) { el.inert = true; el.setAttribute('aria-hidden', 'true'); }
  const focus = root.querySelector('.pit-focus');
  if (focus) {
    const same = focused && focus.querySelector(focused);
    const restored=returnFocus && focus.querySelector(returnFocus);
    // The meter, then the control you were using, then a verdict to read. Never auto-focus Bank.
    const target = root.querySelector('[data-action="stop-rizz"]') || (restored && !restored.disabled ? restored : null) || (same && !same.disabled ? same : null) || root.querySelector('.pit-focus [data-autofocus]') || focus;
    target.focus({ preventScroll: true });
    if (restored) returnFocus=null;
  } else if (returnFocus || focused) {
    // Desktop board and phone strip both carry card controls; return to the one on screen.
    const shown = sel => [...root.querySelectorAll(sel)].find(e => !e.disabled && e.getClientRects().length);
    (shown(returnFocus || focused) || shown('[data-action="open-market"][data-filter="all"]'))?.focus({ preventScroll: true });
    returnFocus = null;
  }
  paintKey = marketKey(g); last = performance.now();
  if (ui.hint && !ui.guidanceOpen) {
    const body = root.querySelector('.pit-focus-body'), bar = root.querySelector('.pit-hintbar');
    if (body) body.insertAdjacentHTML('afterbegin', hintView(ui.hint));
    else if (bar) { bar.innerHTML = hintView(ui.hint); bar.classList.add('has-hint'); }
    const action = ui.hint === 'supplier' ? 'start-rizz' : ui.hint === 'ready' ? 'fill' : ui.hint === 'objective' ? 'focus-supplier' : null;
    if (action) [...root.querySelectorAll(`[data-action="${action}"]`)].find(e => e.getClientRects().length)?.classList.add('guide-target');
  }
  const l = charmActor(g), entry = l?.negotiation?.running && l.negotiation.attempts.at(-1);
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
  const n = charmActor(store.state)?.negotiation, p = n?.running && n.attempts.at(-1).params;
  // STOP arms 450 ms after the meter starts, so a double press on PUSH can never land as a stop.
  if (!p || performance.now() - meterStart < 450) return false;
  return act(g => resolveRizz(g, markerAt(p, performance.now() - meterStart)));
}
function closeFocus() {
  const g = store.state; if (charmActor(g)?.negotiation.running) { act(recoverRizz); return; }
  if (g.arcade.signing) { act(g => { g.arcade.signing = null; return true; }); return; }
  if (g.arcade.confirm?.receipt || g.arcade.confirm?.built) { postReceipt(); return; }
  ui.panel = 'floor'; clearInputs();
  if (ui.panelReturnFocus) {returnFocus=ui.panelReturnFocus;delete ui.panelReturnFocus;}
  if (g.arcade.active) act(leave); else if (g.arcade.confirm) act(g => { g.arcade.confirm = null; return true; }); else render();
  settleAtBell();
}
// All sharing reads the finalized exit. File generation is synchronous, so native sharing
// still starts in the click gesture. Clipboard and share rejections never claim success.
function shareStatus(g, status) { if (store.state !== g) return; ui.shared = { status }; render(); }
function shareAction(g, action, element) {
  if (g.phase !== 'over' || !g.arcade.exit) return;
  const copy = shareCopy(g);
  const write = value => navigator.clipboard?.writeText(value).then(() => shareStatus(g, 'Copied to clipboard'), () => shareStatus(g, 'Clipboard unavailable; select and copy the caption')) || (shareStatus(g, 'Clipboard unavailable; select and copy the caption'), Promise.resolve());
  if (action === 'copy-caption') { write(copy.caption); return; }
  if (action === 'copy-challenge') { write(copy.url); return; }
  if (action === 'download-scorecard') {
    try { const a = document.createElement('a'); a.href = scorecardDataUrl(g); a.download = `cluster-tycoon-seed-${g.seed}.png`; document.body.append(a); a.click(); a.remove(); shareStatus(g, 'Scorecard downloaded'); }
    catch { shareStatus(g, 'Image download unavailable'); }
    return;
  }
  if (action === 'share-x') {
    const u = new URL('https://twitter.com/intent/tweet'); u.searchParams.set('text', copy.caption);
    const opened = window.open(u.toString(), '_blank');
    if (opened) opened.opener = null;
    shareStatus(g, opened ? 'X composer opened; attach your downloaded scorecard there' : 'Pop-up blocked; copy the caption instead'); return;
  }
  if (action === 'share-linkedin') {
    const u = new URL('https://www.linkedin.com/sharing/share-offsite/'); u.searchParams.set('url', copy.url);
    const opened = window.open(u.toString(), '_blank');
    if (!opened) { shareStatus(g, 'Pop-up blocked; copy the caption instead'); return; }
    opened.opener = null;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(copy.caption).then(() => shareStatus(g, 'LinkedIn opened; caption copied. Attach the downloaded image there'), () => shareStatus(g, 'LinkedIn opened; select and copy your caption'));
    else shareStatus(g, 'LinkedIn opened; select and copy your caption');
    return;
  }
  if (action === 'native-share' && navigator.share) {
    try {
      const file = scorecardFile(g), files = [file], payload = { title: 'Cluster Tycoon', text: copy.caption, url: copy.url };
      const data = navigator.canShare?.({files}) ? {...payload,files} : payload;
      navigator.share(data).then(() => shareStatus(g, 'Shared'), error => { if (error?.name !== 'AbortError') shareStatus(g, 'Share unavailable; download or copy instead'); });
    } catch { shareStatus(g, 'Share unavailable; download or copy instead'); }
  }
}
function settleAtBell() { if (training.state) return; const g = store.state; if (g?.phase === 'floor' && g.arcade.time >= V7.seconds && !g.arcade.active && !g.arcade.confirm && !g.arcade.signing) act(closeQuarter); }
function postReceipt() { ui.panel = 'floor'; clearInputs(); if (training.state) { training.act(t => trainingAction(t, 'receiptadvance')); render(); } else { act(transactions.postReceipt); settleAtBell(); } }
function openPanel(panel) { const a = store.state.arcade; if (a.active || a.confirm || a.signing) return; ui.panel = panel; ui.page = 0; clearInputs(); render(); }
function fresh(s) { if (training.state) return; ui.panel = 'floor'; ui.pendingSeed = s; ui.entry = 'found'; ui.guide = null; ui.nameDraft = 'My AI Startup'; ui.showInstructions = false; render(); }
const taskNavigationReady = () => !training.state && !store.error && !ui.guidanceOpen && !ui.focusOpen && ui.panel==='floor' && store.state?.phase==='floor';
function changeTask(delta, focus='[data-task-area]') {
  if (!taskNavigationReady()) return false;
  if (taskView.read(store.state).total<2) return false;
  const card=taskView.move(store.state,delta);
  if (!card) return false;
  ui.taskId=card.id;ui.taskLane=card.lane;ui.taskRound=store.state.q;ui.floorGpu=null;ui.floorNeed=0;ui.floorPage=0;
  returnFocus=focus;const clock=last;render();last=clock;return true;
}
function focusTaskSupply(g,d) {
  if (training.state || g.phase!=='floor' || g.arcade.active || g.arcade.signing || g.arcade.confirm || !['H100','H200','B200'].includes(d.gpu)) return false;
  const card=g.arcade.objectives.find(c=>c.id===d.card);
  if (!card || !taskView.choose(g,card.id)) return false;
  ui.taskId=card.id;ui.taskLane=card.lane;ui.taskRound=g.q;ui.panel='floor';ui.floorGpu=d.gpu;ui.floorNeed=Math.max(1,Number(d.need)||1);ui.floorPage=0;
  // This deliberate sourcing action may choose the first page with matching
  // live supply. Ordinary arrivals never reshuffle the occupied broker seats.
  ui.floorPage=stableOfferSeats(g,ui,innerWidth<=600?2:4).firstLivePage ?? 0;
  clearInputs();const clock=last;render();last=clock;
  const offer=[...root.querySelectorAll('[data-floor-offer],[data-action="focus-supplier"]')].find(el=>!el.disabled && el.getClientRects().length);
  const target=offer || root.querySelector('[data-floor-filter]') || root.querySelector('[data-task-area]');
  target?.focus({preventScroll:true});
  if (innerWidth<=768) target?.scrollIntoView({block:'center',behavior:'auto'});
  return true;
}
function completeTraining(skip = false) {
  const t = training.state;
  if (!t || (!t.launchPending && !skip && t.step !== 'ready') || (skip && !training.completed && !campaign.state)) return;
  if (!t.replay) {
    if (!training.prepareFinish(campaign.state)) { render(); return; }
    const status = trainingHandoffStatus(training.state, campaign.state);
    if (status === 'conflict') { ui.handoffError = 'Your company changed in another tab. Your lesson and company are preserved. Reload the latest tab before starting a new company.'; render(); return; }
    if (status === 'retry' && !campaign.restart(t.seed, t.name)) { render(); return; }
  }
  if (!training.finish()) { render(); return; }
  if (!t.replay) {
    taskView.reset();delete ui.pitSeatState;ui.pitFundingSeen=[];ui.floorPageCount=1;
  }
  ui.panel = 'floor'; ui.cardId = null; ui.guide = null; ui.entry = null; ui.training = null;
  ui.floorGpu=null;ui.floorNeed=0;ui.floorPage=0;
  clearInputs(); prefs.founded = prefs.intro = prefs.welcome = true; prefs.save();
  introInputUntil = performance.now() + 650; render();
}
function closeGuide() {
  if (ui.entry === 'welcome') return;
  if (TIPS[ui.guide]) { prefs.seen.add(ui.guide); prefs.save(); }
  if (!store.state && ui.entry === 'found') return;
  ui.guide = null; ui.entry = null;
  if (ui.guideReturnFocus) { returnFocus = ui.guideReturnFocus; delete ui.guideReturnFocus; }
  render();
}
root.addEventListener('submit', e => {
  if (e.target.id !== 'startup-form') return;
  e.preventDefault();
  if (nameError(ui.nameDraft)) return;
  if (ui.guide === 'rename') { store.act(g => renameStartup(g, ui.nameDraft)); ui.shared = null; }
  else {
    const ok = training.begin(ui.pendingSeed ?? seed(), ui.nameDraft);
    if (!ok) { render(); return; }
    ui.panel = 'floor'; ui.cardId = null; ui.shared = null; clearInputs();
    prefs.founded = prefs.intro = true; prefs.save();
  }
  ui.guide = null; ui.entry = null; delete ui.pendingSeed; render();
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
let swallowClick = false,taskSwipe=null,taskSwipeClickUntil=0,pressedMarketTarget=null;
// A quote that refreshes between press and release must never select a different
// broker or funding offer. Keyboard activation uses the currently focused offer.
root.addEventListener('pointerdown',e=>{
  const b=e.target.closest?.('button[data-action]');
  pressedMarketTarget=b && ['focus-supplier','review-term'].includes(b.dataset.action)
    ? `${b.dataset.action}:${b.dataset.id}` : null;
});
root.addEventListener('pointerdown',e=>{
  if (!taskNavigationReady() || !['touch','pen'].includes(e.pointerType) || !e.target.closest?.('[data-task-area]') || e.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
  taskSwipe={id:e.pointerId,x:e.clientX,y:e.clientY};
});
root.addEventListener('pointermove',e=>{
  if (!taskSwipe || taskSwipe.id!==e.pointerId) return;
  const dx=e.clientX-taskSwipe.x,dy=e.clientY-taskSwipe.y;
  if (Math.abs(dx)>18 && Math.abs(dx)>Math.abs(dy)*1.4 && e.cancelable) e.preventDefault();
},{passive:false});
root.addEventListener('pointerup',e=>{
  if (!taskSwipe || taskSwipe.id!==e.pointerId) return;
  const dx=e.clientX-taskSwipe.x,dy=e.clientY-taskSwipe.y;taskSwipe=null;
  if (Math.abs(dx)<48 || Math.abs(dx)<=Math.abs(dy)*1.4) return;
  if (changeTask(dx<0?1:-1)) {taskSwipeClickUntil=performance.now()+400;if(e.cancelable)e.preventDefault();}
});
root.addEventListener('pointercancel',()=>{taskSwipe=null;pressedMarketTarget=null;});
root.addEventListener('pointerdown', e => { swallowClick = false; const b = e.target.closest('[data-action="stop-rizz"]'); if (b && !b.disabled && e.button === 0) { swallowClick = true; e.preventDefault(); stopMeter(); } });
root.addEventListener('click', e => {
  if (performance.now()<taskSwipeClickUntil) {e.preventDefault();return;}
  if (swallowClick) { swallowClick = false; e.preventDefault(); return; }
  const b = e.target.closest('button[data-action]'); if (!b || b.disabled) return;
  const a = b.dataset.action, g = store.state, d = b.dataset;
  const pressed=pressedMarketTarget;pressedMarketTarget=null;
  if (e.detail>0 && pressed && ['focus-supplier','review-term'].includes(a) && pressed!==`${a}:${d.id}`) {e.preventDefault();return;}
  if (a === 'enter-floor') { prefs.welcome = true; prefs.save(); ui.entry = null; render(); return; }
  if (a === 'hint-dismiss') { ui.hint = null; render(); return; }
  if (a === 'guide-close' || a === 'guide-dismiss') { closeGuide(); return; }
  if (a === 'start-challenge') { ui.challengeDismissed = true; fresh(urlSeed()); return; }
  if (a === 'dismiss-challenge') { ui.challengeDismissed = true; render(); return; }
  if (a === 'view-scorecard') { root.querySelector('.final-share-group')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  if (a === 'guide-instructions') { ui.showInstructions = true; render(); return; }
  if (a === 'intro-replay') { introReturn = ui.entry === 'found' && !store.state ? null : ui.entry; ui.guide = null; ui.entry = 'intro'; render(); return; }
  if (a === 'replay-training') {
    if (training.state) { ui.guide = null; render(); return; }
    if (!training.begin(g.seed, g.company.name || 'My AI Startup', { replay: true })) { ui.handoffError = training.error || 'Training could not start.'; render(); return; }
    ui.guide = null; ui.entry = null; ui.panel = 'floor'; clearInputs(); render(); return;
  }
  if (a === 'rename-startup') { ui.guide = 'rename'; ui.nameDraft = g.company.name; render(); return; }
  if (a === 'help') { if (!g || charmActor(g)?.negotiation.running) return; ui.guideReturnFocus = remember(b); ui.guide = 'help'; render(); return; }
  if (ui.guidanceOpen) return;
  if (a === 'start') { fresh(seed()); return; }
  if (a === 'sound') { sound = sound ? null : createAudio(); ui.sound = !!sound; prefs.sound = !!sound; prefs.save(); render(); return; }
  if (!g || store.error) return;
  if (training.state) {
    if (a === 'training-complete' || a === 'training-skip') { completeTraining(a === 'training-skip'); return; }
    if (a.startsWith('training-')) { training.act(t => trainingAction(t, a, d.gpu)); render(); return; }
    if (['tetris-continue','int-continue'].includes(a)) { training.act(t => trainingAction(t, 'continue')); render(); return; }
    if (['tetris-skip','int-skip','open-market','open-card','open-minigames','open-details','workshop','finish','finish-review','restart','replay-seed','new-market','start-challenge'].includes(a)) return;
  }
  if (a==='task-prev' || a==='task-next') {changeTask(a==='task-prev'?-1:1,remember(b));return;}
  if (a==='task-source') {focusTaskSupply(g,d);return;}
  if (a==='floor-filter-reset') {ui.floorGpu=null;ui.floorNeed=0;ui.floorPage=0;returnFocus=remember(b);const clock=last;render();last=clock;return;}
  if (a==='floor-page') {
    if (!taskNavigationReady()) return;
    const pages=Math.max(1,Number(ui.floorPageCount)||1);
    ui.floorPage=Math.max(0,Math.min(pages-1,ui.floorPage+(Number(d.step)||0)));
    returnFocus=remember(b);const clock=last;render();last=clock;return;
  }
  if (a === 'open-details' || a === 'open-inventory') { returnFocus = remember(b); openPanel(a === 'open-details' ? 'details' : 'inventory'); return; }
  if (a === 'workshop') {
    if (!minigameEligibility(g,d.kind).available) return;
    returnFocus = remember(b); ui.panel = 'floor';
    act(g => startWorkshop(g, d.kind)); return;
  }
  if (a.startsWith('tetris-')) { handleTetrisAction(a, d); return; } // Node Tetris owns its controls
  if (a.startsWith('int-') || a.startsWith('cable-') || a.startsWith('kernel-')) { handleArcadeAction(a, d); return; } // V20: Cable Mania and Kernel Snake
  if (['focus-supplier', 'focus-buyer', 'review-term', 'open-card', 'open-market', 'finish-review', 'review-scenario'].includes(a) && !ui.focusOpen) returnFocus = remember(b);
  if (a === 'open-market') {
    if (d.context==='1') {focusTaskSupply(g,d);return;}
    if (g.arcade.active || g.arcade.signing || g.arcade.confirm?.receipt || g.arcade.confirm?.built) return;
    if (g.arcade.confirm) store.act(g => { g.arcade.confirm = null; return true; }); // leave a bid or term sheet open on the floor
    ui.marketContext = d.context === '1'; ui.marketNeed = Math.max(1, Number(d.need) || 1);
    if (d.context === 'all') { ui.marketContext = false; ui.marketCardId = null; }
    ui.marketFilter = ({ seller: 'supply', buyer: 'buyers' })[d.filter] || d.filter || 'all'; ui.gpu = d.gpu || null;
    if (d.card) ui.marketCardId = d.card; else if (ui.panel !== 'market') ui.marketCardId = ui.panel === 'card' ? ui.cardId : null;
    openPanel('market');
  }
  else if (a === 'market-page') { ui.page = Math.max(0, ui.page + Number(d.step)); render(); }
  else if (a === 'open-card') { if (g.phase !== 'floor') return; if (d.card) selectTaskContext(g,taskView,ui,d.card); ui.cardId = d.card; openPanel('card'); }
  else if (a === 'review-vulture') {
    if (g.phase !== 'floor') return;
    let offered = false;
    ui.panel = 'floor';
    act(g => { const result = maybeVulture(g, d.card); offered = result === 'offer'; return !!result; });
    if (!offered) { selectTaskContext(store.state,taskView,ui,d.card); ui.cardId = d.card; openPanel('card'); }
  }
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
    if (!input || bps === null) return; const next = Math.max(1, Math.min(max, bps + Number(d.step)));
    input.value = (next / 100).toFixed(next % 100 ? (next % 10 ? 2 : 1) : 0); paintInputs({ target: input });
  }
  else if (a === 'close-focus') closeFocus();
  else if (a === 'review-moonshot') { ui.panel = 'floor'; act(reviewMoonshot); }
  else if (a === 'accept-moonshot') { if (act(acceptMoonshot)) { ui.panel = 'card'; ui.cardId = store.state.world.institutional.moonshot.card; selectTaskContext(store.state,taskView,ui,ui.cardId); render(); } }
  else if (a === 'decline-moonshot') act(declineMoonshot);
  // The Deal Room: open a proposal, choose an option (a sale ends the run), pay a contract extension.
  else if (a === 'review-scenario') { ui.panel = 'floor'; clearInputs(); act(g => { if (g.arcade.confirm && !g.arcade.signing && !g.arcade.active && !g.arcade.confirm.receipt && !g.arcade.confirm.built) g.arcade.confirm = null; return reviewScenario(g, d.id); }); }
  else if (a === 'choose-scenario') {
    const before = new Set(g.arcade.objectives.map(o => o.id));
    if (act(g => decideScenario(g, d.option))) {
      const s = store.state, made = s.phase === 'floor' && s.arcade.objectives.find(o => o.kind === 'scenario' && o.status === 'open' && !before.has(o.id));
      if (made && !s.arcade.confirm) { selectTaskContext(s,taskView,ui,made.id); ui.panel = 'card'; ui.cardId = made.id; render(); } else settleAtBell();
    }
  }
  else if (a === 'cure-stage') { if (act(g => cureStage(g, d.card))) { ui.panel = 'floor'; render(); } }
  else if (a === 'haggle') { const value = parseRate(root.querySelector('[data-counter]')?.value); if (!deals.supplierCounterPreview(g, value).valid) return; act(g => { if (!haggle(g, value)) return false; ui.counter = formatRate(activeLot(g).negotiation.price); return true; }); }
  else if (a === 'play-rival') act(g => { if (!playRival(g, d.id)) return false; ui.counter = formatRate(activeLot(g).negotiation.price); return true; });
  else if (a === 'explain-charm') { root.querySelector('[data-counter]')?.focus(); root.querySelector('[data-counter]')?.select(); }
  else if (a === 'start-rizz') act(g => startRizz(g, Number(root.querySelector('[data-sale-qty]')?.value)));
  else if (a === 'stop-rizz') { if (e.detail === 0) stopMeter(); } // keyboard activation only; pointers stop on press
  else if (a === 'buy') { if (act(g => prepareSigning(g, 'purchase'))) sound?.printer(.2); }
  else if (a === 'sign-it') { sound?.scratch(.25); act(signTrade); }
  else if (a === 'cancel-sign') act(g => { g.arcade.signing = null; return true; });
  else if (a === 'post-receipt') postReceipt();
  else if (a === 'allocate') {
    const id = d.card;
    if (act(g => transactions.allocateFromReceipt(g, id))) {
      selectTaskContext(store.state,taskView,ui,id);
      ui.panel='floor';ui.cardId=null;returnFocus='[data-task-area]';render();settleAtBell();
    }
  }
  else if (a === 'reserve') {
    if (!freeOf(g, d.gpu)) {focusTaskSupply(g,{...d,need:Math.max(1,Number(d.qty)||1)});return;}
    act(g => reserve(g, d.card, d.gpu, Math.max(1, Number(d.qty) || 1)));
  }
  else if (a === 'source-block') { if (act(g => sourceBlock(g, d.card))) { ui.panel = 'floor'; ui.cardId = null; render(); } }
  else if (a === 'release') act(g => d.all ? release(g, d.card, null, heldFor(g, d.card)) : release(g, d.card, d.gpu, Math.max(1, Number(d.qty) || 1)));
  else if (a === 'fill') act(g => fill(g, d.card));
  else if (a === 'build') {
    ui.openBefore = { ids: openCards(g).map(o => o.id) }; // so the BUILT moment can name the cards it dealt
    act(g => transactions.buildWithStamp(g, d.card));
  }
  else if (a === 'build-batch') {
    ui.openBefore = { ids: openCards(g).map(o => o.id) };
    act(g => transactions.buildManyWithStamp(g, d.card, d.count === 'max' ? 'max' : Number(d.count)));
  }
  else if (a === 'counter-buyer') { const rate = parseRate(root.querySelector('[data-buyer-counter]')?.value), qty = Number(root.querySelector('[data-sale-qty]')?.value); if (!deals.buyerCounterPreview(g, rate, qty).valid) return; ui.qty = qty; act(g => { if (!counterBuyer(g, rate, qty)) return false; ui.buyerCounter = formatRate(g.arcade.buyers.find(b => b.id === g.arcade.confirm.buyerId).rate); return true; }); }
  else if (a === 'sell-buyer') { const qty = Number(root.querySelector('[data-sale-qty]')?.value); act(g => prepareSigning(g, 'buyer', qty)); }
  else if (a === 'counter-term') { const bps = deals.parsePct(root.querySelector('[data-term-pct]')?.value); if (!deals.termCounterPreview(g, bps).valid) return; delete ui.termPct; act(g => counterTerm(g, bps)); if (!store.state.arcade.confirm) { ui.panel = 'floor'; render(); } }
  else if (a === 'accept-term') act(g => prepareSigning(g, 'term'));
  else if (a === 'decline-term') { ui.panel = 'floor'; clearInputs(); act(declineTerm); settleAtBell(); }
  else if (a === 'finish-review') act(g => { if (g.arcade.active || g.arcade.confirm || g.arcade.signing) return false; g.arcade.confirm = { finish: true }; return true; });
  else if (a === 'finish') { ui.panel = 'floor'; act(g => { g.arcade.confirm = null; return closeQuarter(g); }); }
  else if (a === 'next') {
    ui.panel = 'floor'; ui.cardId = null; clearInputs();
    // An extraordinary offer opens the Deal Room once, as the round opens (the floor is paused while it is read).
    if (act(openQuarter)) { const o = liveOffers(store.state).find(o => o.major && !o.seen); if (o) act(g => reviewScenario(g, o.id)); }
  }
  else if (a === 'restart-review') act(g => { g.arcade.confirm = { restart: true }; return true; });
  else if (a === 'restart') fresh(seed());
  else if (a === 'replay-seed') { const s = Number(d.seed) >>> 0; fresh(s); try { history.replaceState(null, '', `?seed=${s}`); } catch { /* URL unchanged */ } render(); }
  else if (['copy-caption','copy-challenge','download-scorecard','share-x','share-linkedin','native-share'].includes(a)) shareAction(g, a, b);
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
    const buyer = g.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId);
    const charm = root.querySelector('[data-buyer-charm]'); if (buyer && charm) charm.innerHTML = buyerCharmView(g, buyer, qty);
    if (Number.isSafeInteger(qty) && qty > 0) for (const k of root.querySelectorAll('[data-action="step-offer"][data-kind="buyer"]')) { const step = Math.abs(Number(k.dataset.step)), amount = deals.money(cents(qty, step)), hint = k.querySelector('small'); if (hint) hint.textContent = amount; k.setAttribute('aria-label', `${Number(k.dataset.step) < 0 ? 'Decrease' : 'Increase'} resale ask by ${step} cents, ${amount} on ${qty} GPUs`); }
  }
  if (input.matches('[data-term-pct]')) { const p = deals.termCounterPreview(g, deals.parsePct(input.value)); update('[data-term-total]', p); update('[data-term-own]', p.own); update('[data-term-label]', p.label); light('counter-term', p.valid); }
}
root.addEventListener('input', paintInputs); root.addEventListener('change', paintInputs);
document.addEventListener('keydown', e => {
  if (taskNavigationReady() && e.target.closest?.('[data-task-area]') && !e.target.closest?.('input,textarea,select,[contenteditable="true"],[role="slider"],[role="combobox"]') && !e.ctrlKey && !e.metaKey && !e.altKey && ['ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault();if (!e.repeat) changeTask(e.key==='ArrowLeft'?-1:1);return;
  }
  if (ui.guidanceOpen) {
    const dialog = root.querySelector('.founding-dialog');
    if (!dialog) return;
    if (e.key === 'Escape') { e.preventDefault(); closeGuide(); }
    if (e.key === 'Tab') {
      const all = [...dialog.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')].filter(el => el.getClientRects().length);
      if (e.shiftKey && (document.activeElement === all[0] || document.activeElement === dialog)) { e.preventDefault(); all.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === all.at(-1)) { e.preventDefault(); all[0]?.focus(); }
    }
    return;
  }
  if (!root.querySelector('.pit-focus') || store.state?.phase === 'integration') return; // the puzzle owns its keys
  if (e.repeat && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return; }
  if ((e.key === ' ' || e.key === 'Enter') && charmActor(store.state)?.negotiation.running) { e.preventDefault(); if (!e.repeat) stopMeter(); return; }
  if (e.key === 'Escape') { e.preventDefault(); if (charmActor(store.state)?.negotiation.running) act(recoverRizz); else if (store.state?.phase === 'floor') closeFocus(); return; }
  if (e.key === 'Tab') { const all = controls(), first = all[0], end = all.at(-1); if (!all.length) return; if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('pit-focus'))) { e.preventDefault(); end.focus(); } else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); } }
});
// The floor clock: 250ms ticks while no desk or overlay is open.
setInterval(() => {
  const now = performance.now(), dt = (now - last) / 1000; last = now; const g = store.state;
  if (!g || training.state || ui.guidanceOpen || store.error || document.hidden || g.phase !== 'floor' || g.arcade.active || g.arcade.confirm || g.arcade.signing || ui.panel !== 'floor') return;
  const before = fx.snapshot(g); if (!store.act(g => advance(g, dt))) { if (store.error) render(); return; }
  const next = store.state;
  if (marketKey(next) !== paintKey) { render(); fx.play(root, fx.effects(before, fx.snapshot(next)).filter(e => e.type === 'arrival' || e.type === 'cash' || e.type === 'valuation'), sound); return; }
  for (const el of root.querySelectorAll('[data-floor-clock]')) el.textContent = `${Math.ceil(V7.seconds - next.arcade.time)}s`;
  for (const el of root.querySelectorAll('[data-station-until]')) { const until = Number(el.dataset.stationUntil), at = Number(el.dataset.stationAt || 0), left = Math.max(0, until - next.arcade.time); el.textContent = `${Math.ceil(left)}s`; el.closest('[data-fuse]')?.style.setProperty('--left', String(Math.min(1, left / Math.max(1, until - at)))); el.closest('[data-fuse]')?.classList.toggle('is-short', left < 8); }
}, 250);
window.addEventListener('storage', e => { if (e.key === V7.key || e.key === TRAINING_KEY) { ui.handoffError = 'Another tab changed your saved progress. Reload this tab to continue from the latest state.'; render(); } });
attachTetris({ root, store, act, render, ui, sound: () => sound });
attachArcade({ root, store, act, render, ui, sound: () => sound });
if (training.state?.launchPending) completeTraining(); else render();
