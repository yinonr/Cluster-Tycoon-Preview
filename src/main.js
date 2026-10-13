// Boot + screen router.
// Flow: office → ad (coupon) → sheet (need sheet) → lobby → floor → results
// Venture Mode: ad → hq (board memo) → sheet → (lobby, Q1 only) → floor → quarter (lever → report) → hq … → quarter (exit)

import { createAudio } from './audio.js';
import { makeRng, newSeed } from './util.js';
import { MODES } from './modes/index.js';
import { store } from './store.js';
import { today } from './daily.js';
import { readChallenge } from './share/links.js';
import office from './screens/office.js';
import ad from './screens/ad.js';
import sheet from './screens/sheet.js';
import lobby from './screens/lobby.js';
import floor from './screens/floor.js';
import results from './screens/results.js';
import hq from './screens/hq.js';
import quarter from './screens/quarter.js';
import home from './screens/home.js';
import cycle from './screens/cycle.js';
import { createTycoonStore, quarterSeed } from './tycoon/game.js';
import { createVentureStore } from './venture/save.js';
import { buildRun } from './venture/floor.js';

const SCREENS = { office, ad, sheet, lobby, floor, results, hq, quarter, home, cycle };
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);

let pinnedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
// ?venture=new (or a bare ?venture, or #venture: a Claude Artifact passes the
// page a plain #anchor but never the query string): straight into a saved
// six-quarter company, resuming the one in progress if there is one.
// ?venture=N: a memory-only test company on seed N (never saved, never official).
const ventureParam = params.has('venture') ? params.get('venture') : null;
const playVenture = (ventureParam != null && !/^\d+$/.test(ventureParam)) || location.hash === '#venture';
const devVenture = ventureParam != null && !playVenture ? Number(ventureParam) >>> 0 : null;
const rulesVersion = () => MODES.buyer.rulesVersion ?? 1;
// ?lab (or #lab): the V3 Deal Lab, an opt-in experiment on the Daily Floor's
// engine. ?lab=N plays seed N. Never official, never recorded, never shared.
// A page can make the lab its front door (lab.html, the V3 preview Artifact): with no
// other address, it opens the lab's main page instead of the office.
const labDoor = app.dataset.entry === 'lab' && !location.hash && !params.has('venture') && !params.has('screen');
const labParam = params.has('lab') ? params.get('lab') : location.hash === '#lab' || labDoor ? '' : null;
const labSeed = labParam && /^\d+$/.test(labParam) ? Number(labParam) >>> 0 : null;
// ?tycoon=N: a new Tycoon run on seed N, straight onto quarter 1. ?tycoon or #tycoon: the saved run.
const tyParam = params.has('tycoon') ? params.get('tycoon') : location.hash === '#tycoon' ? '' : null;

const ctx = {
  audio: createAudio(),
  params,
  persona: 'buyer',
  mode: MODES.buyer,
  run: null,
  seenOffice: false,
  player: loadPlayer(), // { name, firm } from the coupon
  stats: store,
  // A friend's "same need sheet, your paddle" link (?s=…&vs=…&by=…).
  challenge: readChallenge(location.search.slice(1) || location.hash.slice(1), rulesVersion()),
  skippedOffice: false,
  setPlayer(player) {
    ctx.player = player;
    try { localStorage.setItem('hsc-player', JSON.stringify(player)); } catch { /* per-viewer convenience only */ }
  },
  go,
  // kind: 'daily' (today's floor, official once), 'practice', or 'dev' (?seed= / ?screen=, never official).
  // dailyOf: the daily floor this seed is, official or not, so links name it.
  newRun({ seed = null, kind = 'practice', challenge = null, dailyOf = null } = {}) {
    ctx.mode = MODES[ctx.persona];
    if (pinnedSeed != null && seed == null) { seed = pinnedSeed; kind = 'dev'; }
    pinnedSeed = null; // only the first run uses ?seed=
    const daily = kind === 'daily' ? today(ctx.mode.rulesVersion ?? 1) : null;
    const s = daily ? daily.seed : seed ?? newSeed();
    ctx.run = ctx.mode.createRun({ rng: makeRng(s), seed: s });
    const now = today(ctx.mode.rulesVersion ?? 1);
    dailyOf = daily || dailyOf || (s === now.seed ? now : null) || (challenge?.daily?.seed === s ? challenge.daily : null);
    Object.assign(ctx.run, { kind, daily, dailyOf, challenge, playerName: ctx.player.name });
    if (ctx.player.firm) ctx.run.mandate.company = ctx.player.firm;
    return ctx.run;
  },
  // The Deal Lab (V3 experiment): the Buyer floor with lab grading and scoring.
  // kind 'lab' is never official and never reaches the daily stats or a share.
  // Never today's Daily seed: the lab's hindsight would spoil the official floor.
  labTries: {},
  newLab({ seed = null } = {}) {
    ctx.mode = MODES.lab;
    let s = seed ?? newSeed();
    while (s === today(rulesVersion()).seed) s = newSeed();
    ctx.run = ctx.mode.createRun({ rng: makeRng(s), seed: s });
    ctx.labTries[s] = (ctx.labTries[s] || 0) + 1; // first plays vs replays, for playtests
    Object.assign(ctx.run, { kind: 'lab', labTry: ctx.labTries[s], daily: null, dailyOf: null, challenge: null, playerName: ctx.player.name });
    if (ctx.player.firm) ctx.run.mandate.company = ctx.player.firm;
    return ctx.run;
  },
  // Venture Mode. The company lives in its own save ('hsc-venture-v1'); a
  // venture never calls newRun or firstRun and never reaches results.js.
  // THE TYCOON (V6): an ongoing game, one quarter per floor (src/tycoon/). Never official, never recorded.
  tycoon: createTycoonStore(),
  newTycoon({ seed = null } = {}) {
    ctx.tycoon.newGame(seed ?? newSeed(), ctx.player);
    return ctx.newQuarter();
  },
  newQuarter() {
    const g = ctx.tycoon.state;
    if (!g || g.phase === 'over') return null;
    ctx.mode = MODES.tycoon;
    const s = quarterSeed(g);
    ctx.run = ctx.mode.createRun({ rng: makeRng(s), seed: s, game: g, store: ctx.tycoon });
    Object.assign(ctx.run, { kind: 'tycoon', daily: null, dailyOf: null, challenge: null, playerName: ctx.player.name });
    ctx.tycoon.startQuarter();
    return ctx.run;
  },
  venture: createVentureStore(),
  startVenture({ seed = null, dev = false } = {}) {
    ctx.mode = MODES.venture;
    ctx.run = null;
    return ctx.venture.start({ seed: seed ?? newSeed(), player: { name: ctx.player.name, firm: ctx.player.firm || 'Your company' }, dev });
  },
  // This quarter's floor, once the objective is picked.
  ventureRun() {
    const s = ctx.venture.state;
    if (!s || s.phase !== 'briefed') return null;
    ctx.mode = MODES.venture;
    ctx.run = buildRun(s);
    ctx.run.playerName = s.player.name;
    return ctx.run;
  },
  // Where the current venture is: the office (memo) or the quarter screen.
  ventureScreen() {
    const s = ctx.venture.state;
    if (!s) return 'ad';
    return ['memo', 'briefed'].includes(s.phase) ? 'hq' : 'quarter';
  },
  // The run the coupon starts: a friend's challenge, else today's floor if it
  // hasn't been played on this device, else practice.
  firstRun() {
    const d = today(rulesVersion());
    const ch = ctx.challenge;
    ctx.challenge = null;
    if (ch) {
      const official = ch.daily && ch.daily.iso === d.iso && !store.daily(d.iso);
      return ctx.newRun(official ? { kind: 'daily', challenge: ch } : { seed: ch.seed, challenge: ch });
    }
    return ctx.newRun(store.daily(d.iso) ? {} : { kind: 'daily' });
  },
};

function loadPlayer() {
  try { return JSON.parse(localStorage.getItem('hsc-player')) || { name: '', firm: '' }; }
  catch { return { name: '', firm: '' }; }
}

let cleanup = null;
function go(name, data) {
  if (app.dataset.screen === 'office' && name !== 'office') store.markSeenOffice();
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  app.innerHTML = '';
  const root = document.createElement('section');
  root.className = `screen screen-${name}`;
  app.dataset.screen = name;
  app.appendChild(root);
  window.scrollTo(0, 0);
  cleanup = SCREENS[name](root, ctx, data) || null;
}

// Mute toggle
const muteBtn = document.getElementById('mute');
const paintMute = () => {
  muteBtn.textContent = ctx.audio.muted ? 'SOUND OFF' : 'SOUND ON';
  muteBtn.setAttribute('aria-pressed', String(!ctx.audio.muted));
};
muteBtn.addEventListener('click', () => { ctx.audio.toggle(); paintMute(); });
paintMute();

// A floor left by a reload is over: its deals were saved as they were signed.
ctx.venture.recover();
const tyRecovered = ctx.tycoon.recover(); // a floor left mid-quarter (a reload) settles with what was signed
ctx.venture.listen(window);

// ?screen=floor etc. jumps straight in (for testing and kiosk use).
const start = params.get('screen');
if (tyParam != null) {
  ctx.challenge = null;
  ctx.skippedOffice = true;
  if (/^\d+$/.test(tyParam)) { ctx.newTycoon({ seed: Number(tyParam) >>> 0 }); go('floor'); } else go(ctx.tycoon.state && ctx.tycoon.state.report ? 'cycle' : 'home');
} else if (labParam != null) {
  // #lab or ?lab: the lab's main page (START TRADING → the floor). ?lab=N: straight onto floor N.
  ctx.challenge = null;
  ctx.skippedOffice = true;
  if (labSeed != null || pinnedSeed != null) { ctx.newLab({ seed: labSeed ?? pinnedSeed }); pinnedSeed = null; go('floor'); } else go(tyRecovered ? 'cycle' : 'home'); // back from a reload mid-quarter: its report
} else if (playVenture) {
  const cur = ctx.venture.state;
  if (!cur || cur.dev || cur.phase === 'over') ctx.startVenture();
  ctx.skippedOffice = true;
  go(ctx.ventureScreen());
} else if (devVenture != null || (start && ['hq', 'quarter'].includes(start))) {
  // ?venture=N (or ?screen=hq|quarter): a dev venture in memory.
  if (devVenture != null || !ctx.venture.state) ctx.startVenture({ seed: devVenture ?? undefined, dev: true });
  ctx.skippedOffice = true;
  go(ctx.ventureScreen());
} else if (start && SCREENS[start]) {
  if (['sheet', 'lobby', 'floor', 'results'].includes(start)) ctx.newRun({ kind: 'dev' });
  go(start);
} else if (ctx.challenge || store.seenOffice()) {
  // Friends with a challenge and returning players go straight to the coupon.
  ctx.skippedOffice = true;
  go('ad');
} else {
  go('office');
}

window.__hsc = ctx; // handy for debugging and automated play-tests
// Previews that don't pass the address through can still try a challenge:
// __hsc.tryChallenge('s=123&vs=8420&by=Sam&v=1')
ctx.tryChallenge = (query) => { ctx.challenge = readChallenge(query, rulesVersion()); ctx.skippedOffice = true; go('ad'); };
