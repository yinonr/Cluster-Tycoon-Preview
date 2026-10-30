// Name the company and read the sticky note. Pass 5 hands directly to Babur;
// legacy callers without ctx.training retain the original six-call desk.
// Based on the V10.18 name-first office (0c070cd) and taped briefing (d16e18f).
// The old phone-tag gag now hands directly to gameplay; no film or event pitch.
import { el, $, esc, reducedMotion } from '../util.js';
import { nameError } from '../tycoon/startup-name.js';
import { WINDOW } from '../media.js';

// Calendar beats for the six calls.
const SLIPS = [
  { from: 'Jim · your broker', msg: 'Knows a guy.', week: 1, calls: 3 },
  { from: 'Jim · your broker', msg: 'The guy knows a guy.', week: 1, calls: 5 },
  { from: 'A seller, via the guy', msg: 'What GPU did you need?', week: 2, calls: 8 },
  { from: 'Sales rep', msg: 'Wants to schedule a call. Earliest: Thursday.', week: 3, calls: 11 },
  { from: 'Fax room', msg: 'NDA incoming. 14 pages. Initial each.', week: 4, calls: 13 },
  { from: 'Seller', msg: 'Pricing to follow.', week: 5, calls: 16 },
  { from: 'Legal', msg: 'Has comments on their comments.', week: 6, calls: 19 },
  { from: 'Jim · your broker', msg: 'Capacity no longer available.', week: 7, calls: 22, bad: true },
  { from: 'Jim · your broker', msg: 'Can get you capacity in Q2 next year.', week: 7, calls: 23 },
];

// What you get every time you call back. Dealt in shuffled order; they never run out.
const EXCUSES = [
  { from: 'Jim · your broker', msg: 'Circling back.' },
  { from: 'Jim · your broker', msg: 'Still circling.' },
  { from: 'Jim · your broker', msg: 'My guy’s guy is on vacation.' },
  { from: 'Jim · your broker', msg: 'Should hear back EOW.' },
  { from: 'Jim · your broker', msg: 'EOW is now EOM.' },
  { from: 'Jim’s guy', msg: 'Out of office until the 14th.' },
  { from: 'The guy’s guy', msg: 'Who gave you this number?' },
  { from: 'Sales rep', msg: 'Can we hop on a quick call?' },
  { from: 'Sales rep', msg: 'Quick call ran long. Can we do another?' },
  { from: 'Sales rep', msg: 'Calendar invite sent. For three weeks from Thursday.' },
  { from: 'Account exec', msg: 'Looping in my colleague.' },
  { from: 'Account exec', msg: 'Looping in my colleague’s colleague.' },
  { from: 'Seller', msg: 'What GPU did you need again?' },
  { from: 'Seller', msg: 'We had it. A lab took it.' },
  { from: 'Seller', msg: 'Capacity is “coming online soon.”' },
  { from: 'Seller', msg: 'Delivery window is flexible. Very flexible.' },
  { from: 'Seller', msg: 'Sent the wrong spreadsheet. Ignore the prices.' },
  { from: 'Seller', msg: 'Prices went up while you were on hold.' },
  { from: 'Seller', msg: 'Is this still a priority for you?' },
  { from: 'Deal desk', msg: 'Minimum commitment: three years.' },
  { from: 'Deal desk', msg: 'We only sell in blocks of 4,096.' },
  { from: 'Deal desk', msg: 'Quote expired. New quote attached. It’s higher.' },
  { from: 'Deal desk', msg: 'Send a PO and we’ll send pricing.' },
  { from: 'Deal desk', msg: 'Approval needs one more signature. His.' },
  { from: 'Their legal', msg: 'NDA first. Then the NDA for the NDA.' },
  { from: 'Their legal', msg: 'Redlines on your redlines.' },
  { from: 'Their legal', msg: 'Governing law: to be discussed.' },
  { from: 'Your legal', msg: 'Waiting on their legal.' },
  { from: 'Their procurement', msg: 'Please complete our vendor intake form. 31 pages.' },
  { from: 'Their procurement', msg: 'Need a reference from your last GPU provider.' },
  { from: 'Finance', msg: 'Credit check pending.' },
  { from: 'Their CFO', msg: 'Prepay 100%. Delivery TBD.' },
  { from: 'Data center ops', msg: 'Power’s not online yet. Neither is the building.' },
  { from: 'Data center ops', msg: 'The racks are in a warehouse. Somewhere.' },
  { from: 'Data center ops', msg: 'Site tour available. In Iceland.' },
  { from: 'Capacity team', msg: 'Lead time: 6–8 weeks. Or 16.' },
  { from: 'Capacity team', msg: 'Can you do Q3? Of next year?' },
  { from: 'Capacity team', msg: 'We can do H20s. Same thing, right?' },
  { from: 'Fax room', msg: 'Fax jammed. Please resend.' },
  { from: 'Fax room', msg: 'Received page 1 of 14.' },
  { from: 'Voicemail', msg: 'Mailbox full.' },
  { from: 'Voicemail', msg: 'Your call is important to us.' },
  { from: 'Front desk', msg: 'Line’s busy. Please hold.' },
  { from: 'Unknown caller', msg: 'Wrong number. But do you need GPUs?' },
  { from: 'Their assistant', msg: 'He’s at a conference.' },
  { from: 'Their assistant', msg: 'She’s at a different conference.' },
  { from: 'Your investor', msg: 'Have you tried asking around?' },
  { from: 'Partnerships', msg: 'Let’s explore a strategic partnership first.' },
  { from: 'Customer success', msg: 'Your account rep has left the company.' },
  { from: 'Customer success', msg: 'Your new account rep is onboarding.' },
];

// Deals from a shuffled pile and reshuffles when the pile runs out.
function deck(items) {
  let pile = [];
  return () => {
    if (!pile.length) {
      pile = items.slice();
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
    }
    return pile.pop();
  };
}

// The pointing hand that invites the first click, drawn like a 1984 cursor
// from a 16×16 bitmap: X = ink, o = paper.
const HAND_BITMAP = [
  '......XX........',
  '.....XooX.......',
  '.....XooX.......',
  '.....XooX.......',
  '.....XooXXX.....',
  '.....XooXooXXX..',
  '..XX.XooXooXooXX',
  '.XooXoooXooXoooX',
  '.XoooooooooooooX',
  '..XooooooooooooX',
  '..XooooooooooooX',
  '...XooooooooooX.',
  '...XooooooooooX.',
  '....XooooooooX..',
  '....XooooooooX..',
  '....XXXXXXXXXX..',
];
const HAND = (() => {
  const pixels = (ch) => HAND_BITMAP.map((row, y) => [...row].map((c, x) => (c === ch ? `M${x} ${y}h1v1h-1z` : '')).join('')).join('');
  return `<svg class="nudge-hand" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
    <path d="${pixels('o')}" fill="#FFFFFF"/><path d="${pixels('X')}" fill="#1B1814"/></svg>`;
})();

const slipHTML = ({ from, msg, bad }, forName = 'You') => `
  <div class="slip${bad ? ' bad' : ''}">
    <div class="slip-h">WHILE YOU WERE OUT</div>
    <div class="slip-row slip-for"><b>FOR</b> ${esc(forName)}</div>
    <div class="slip-row"><b>FROM</b> ${esc(from)}</div>
    <div class="slip-msg">“${esc(msg)}”</div>
    <div class="slip-f">☒ WILL CALL AGAIN</div>
  </div>`;

const PHONE = `
<svg class="desk-phone" viewBox="0 0 120 80" aria-hidden="true">
  <path d="M10 70 L22 34 L98 34 L110 70 Z" fill="#D8CCB2" stroke="#1B1814" stroke-width="2"/>
  <rect x="38" y="42" width="44" height="22" rx="3" fill="#C2B594" stroke="#1B1814" stroke-width="1.5"/>
  <g fill="#1B1814">${Array.from({ length: 12 }, (_, i) => `<rect x="${42 + (i % 4) * 10}" y="${45 + Math.floor(i / 4) * 6}" width="6" height="3.5" rx="1"/>`).join('')}</g>
  <path class="handset" d="M14 30 C14 18 22 14 30 14 L90 14 C98 14 106 18 106 30 L94 30 C94 24 90 22 86 22 L34 22 C30 22 26 24 26 30 Z" fill="#E3D8C0" stroke="#1B1814" stroke-width="2"/>
  <path d="M10 64 q-6 4 0 8 q6 4 0 8" fill="none" stroke="#BFB194" stroke-width="2"/>
</svg>`;

// The website's switches: speaker and motion glyphs, as on hscompute.com's MOTION and SOUND pills.
const GLYPH = {
  sound: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor"/><path class="wave" d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path class="x" d="M11 6l4 4M15 6l-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  motion: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5h6M1.5 8h4M1.5 11h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="11.5" cy="8" r="3" fill="currentColor"/></svg>',
};

// The sticky-note briefing: keep the player's name and the compute premise concise.
const NAME = Symbol('name');
function briefParts(name) {
  return [
    ['You’re the CEO of ', NAME, '. You have an idea, a team, and your savings.'],
    ['One thing’s missing: compute. Click the screen to chase down your GPUs.'],
  ];
}
export const briefText = (name) => briefParts(name).map((p) => p.map((x) => (x === NAME ? name : x)).join(''));
const briefHTML = (name) => briefParts(name)
  .map((p) => `<p>${p.map((x) => (x === NAME ? `<span class="brief-name">${esc(name)}</span>` : esc(x))).join('')}</p>`).join('');

// ctx: { audio, name() (the company's name, or null before naming), story (play Scenes 2-4 after Scene 1),
//        found(name) → true or an error string, done(), sound { on, set(on) }, motion { on, set(on) } }
export default function office(root, ctx) {
  let alive = true;
  let stage = 'window'; // window → brief → calls → world → after
  let wake = null;
  let lastClick = -Infinity;
  let clicks = 0;     // how many times you called back
  let calls = 0;      // calls in the story so far
  let callBacks = 0;  // excuses your call backs got you
  let nudges = 0;     // times the hand has asked
  let nudgeTimer = null;
  let nudgeOff = false;
  let lastRustle = 0;
  const nextExcuse = deck(EXCUSES);
  // Reduced motion (the system setting) or MOTION off (the opening's switch, as on hscompute.com): no camera moves.
  const calm = () => reducedMotion() || !ctx.motion.on;
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  const named = () => ctx.name();
  const forName = () => named() || 'You';
  // Reading beats are timed; only the explicit Skip control can end the intro.
  const pause = (ms) => new Promise((res) => {
    const done = () => { clearTimeout(t); wake = null; res(); };
    const t = setTimeout(done, ms);
    wake = done;
  });

  const draft = named() || '';
  root.innerHTML = `
    <div class="office pass1-opening at-window${calm() ? ' is-calm' : ''}">
      <div class="office-window">
        <img class="view" src="${esc(WINDOW.still)}" alt="${esc(WINDOW.alt)}" decoding="async" fetchpriority="high">
        <div class="view-grain" aria-hidden="true"></div>
        <div class="mullions"></div>
      </div>
      <header class="office-title">
        <p class="kicker ui">YOUR CORNER OFFICE · SAN FRANCISCO · 2026</p>
      </header>
      <div class="office-desk">
        <div class="desk-surface"></div>
        <div class="calendar paper">
          <div class="cal-ring"></div>
          <div class="cal-month caps">This quarter</div>
          <div class="cal-week hl">WEEK 0</div>
          <div class="cal-sub">Still sourcing</div>
        </div>
        <div class="computer beige">
          <div class="computer-screen">
            <div class="mac-window">
              <div class="mac-title"><span class="proc-title">Procurement</span></div>
              <div class="mac-body">
                <div class="proc-idle">
                  <p class="proc-need">NEED: 512 × H100 · THIS QUARTER</p>
                  <button class="btn default big source" type="button">SOURCE COMPUTE</button>
                </div>
                <div class="proc-status" aria-live="polite" hidden></div>
              </div>
            </div>
            <div class="screen-static" aria-hidden="true"></div>
          </div>
          <div class="computer-chin"><span class="slot"></span></div>
        </div>
        ${PHONE}
      </div>
      <div class="brief" hidden>
        <article class="brief-paper">
          <div class="brief-copy" id="brief-copy"></div>
          <button type="button" class="brief-go" aria-describedby="brief-copy">SOURCE COMPUTE <span aria-hidden="true">→</span></button>
        </article>
      </div>
      <div class="slips" aria-live="polite"></div>
      <div class="taps" aria-hidden="true"></div>
      <div class="nudge" hidden aria-hidden="true">
        <span class="nudge-ring"></span>
        ${HAND}
        <span class="nudge-label ui"></span>
      </div>
      <div class="tally ui" hidden>
        <span>WEEKS <b class="t-weeks">0</b></span>
        <span>CALLS <b class="t-calls">0</b></span>
        <span>GPUs SECURED <b>0</b></span>
      </div>
      <div class="office-overlay" hidden>
        <div class="chorus back" aria-hidden="true"></div>
        <div class="world"><div class="world-track"></div></div>
        <div class="chorus front" aria-hidden="true"></div>
        <div class="finale">
          <h2 class="better hl-cond">There has to be a better way.</h2>
        </div>
      </div>
      <section class="s1" aria-labelledby="s1-title">
        <div class="s1-inner">
          <div class="s1-lockup"><img class="s1-lockup-img" src="${esc(WINDOW.lockup)}" width="148" height="52" alt="Haight Street Compute"></div>
          <p class="s1-game" id="s1-title">CLUSTER TYCOON</p>
          ${named() ? `<p class="s1-named"><span>YOUR STARTUP</span><b>${esc(draft)}</b></p>
          <button type="button" class="s1-start" data-autofocus>${GLYPH.sound}<span>Continue</span></button>`
            : `<form class="s1-form" novalidate>
            <label for="s1-input">NAME YOUR STARTUP</label>
            <input id="s1-input" name="startup" type="text" maxlength="64" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="go" placeholder="Your startup’s name" aria-describedby="s1-error" data-autofocus>
            <p id="s1-error" class="s1-error" aria-live="polite"></p>
            <button type="submit" class="s1-start" disabled>${GLYPH.sound}<span>Start</span></button>
          </form>`}
          <button type="button" class="s1-skip">${named() ? 'Skip intro' : 'Start without the intro'}</button>
        </div>
      </section>
      <div class="op-hud">
        <button type="button" class="op-pill op-motion" aria-pressed="true">${GLYPH.motion}<span>Motion on</span></button>
        <button type="button" class="op-pill op-sound" aria-pressed="true">${GLYPH.sound}<span>Sound on</span></button>
        <button type="button" class="op-pill op-skip" hidden>Skip intro <span aria-hidden="true">→</span></button>
      </div>
      <p class="hint ui" hidden></p>
    </div>`;

  const office = $(root, '.office');
  const status = $(root, '.proc-status');
  const slips = $(root, '.slips');
  const tally = $(root, '.tally');
  const hint = $(root, '.hint');
  const nudge = $(root, '.nudge');
  const input = $(root, '#s1-input');

  // ---- The switches (MOTION, SOUND) and the global skip ------------------------------------------------------
  function paintSwitches() {
    const m = $(root, '.op-motion'), s = $(root, '.op-sound');
    m.setAttribute('aria-pressed', String(ctx.motion.on)); m.lastElementChild.textContent = ctx.motion.on ? 'Motion on' : 'Motion off';
    s.setAttribute('aria-pressed', String(ctx.sound.on)); s.lastElementChild.textContent = ctx.sound.on ? 'Sound on' : 'Sound off';
    office.classList.toggle('is-calm', calm());
    office.classList.toggle('is-silent', !ctx.sound.on);
  }
  $(root, '.op-motion').addEventListener('click', () => { ctx.motion.set(!ctx.motion.on); paintSwitches(); });
  $(root, '.op-sound').addEventListener('click', () => { ctx.sound.set(!ctx.sound.on); paintSwitches(); if (ctx.sound.on) ctx.audio.blip(880, 0.04); });
  paintSwitches();

  // Escape skips the rest of the story (never the naming: there is no company until the name is in).
  const onKey = (e) => { if (e.key === 'Escape' && alive && stage !== 'window') { e.preventDefault(); finish(); } };
  document.addEventListener('keydown', onKey);
  const stop = () => { alive = false; stage = 'after'; wake?.(); clearTimeout(nudgeTimer); ctx.audio.cutChorus(); document.removeEventListener('keydown', onKey); };
  const finish = () => { if (!alive) return; stop(); ctx.done(); };
  $(root, '.op-skip').addEventListener('click', finish);

  // ---- Scene 1: the window ---------------------------------------------------------------------------------------
  function paintName() {
    if (!input) return;
    const error = nameError(input.value);
    $(root, '#s1-error').textContent = input.value.trim() ? error : '';
    $(root, '.s1-start').disabled = !!error;
    input.setAttribute('aria-invalid', String(!!(input.value.trim() && error)));
  }
  input?.addEventListener('input', paintName);
  function begin(story) {
    if (stage !== 'window') return;
    if (!named()) {
      const result = ctx.found(input.value);
      if (result !== true) { $(root, '#s1-error').textContent = result || 'Choose another name.'; input.focus(); return; }
    }
    if (!story) { finish(); return; }
    toOffice();
  }
  $(root, '.s1-form')?.addEventListener('submit', (e) => { e.preventDefault(); begin(ctx.story); });
  if (named()) $(root, '.s1-start').addEventListener('click', () => begin(true));
  $(root, '.s1-skip').addEventListener('click', () => (named() ? finish() : (nameError(input.value) ? paintName() : begin(false))));
  (input || $(root, '.s1-start')).focus({ preventScroll: true });

  // The camera pulls back from the glass into the office, as the website's cold open does: the same view shrinks
  // into the office window and the desk rises into place.
  async function toOffice() {
    stage = 'idle';
    $(root, '.op-skip').hidden = false;
    ctx.audio.whoosh(calm() ? 0.5 : 1.3);
    office.classList.add('leaving-window');
    await pause(calm() ? 160 : 260, false);
    office.classList.remove('at-window', 'leaving-window');
    $(root, '.s1').inert = true;
    $(root, '.proc-title').textContent = `Procurement · ${forName()}`;
    await pause(300, false);
    if (!alive) return;
    $(root, '.s1').hidden = true;
    office.classList.add('at-desk');
    showBrief();
  }

  // The CEO briefing lies on the desk until the player is ready: no timer, no nudge. SOURCE COMPUTE → takes it
  // off the desk and starts Scene 2 exactly as the computer's own SOURCE COMPUTE does.
  function showBrief() {
    stage = 'brief';
    const brief = $(root, '.brief');
    $(brief, '.brief-copy').innerHTML = ctx.training ? `<p>You’re the CEO of <span class="brief-name">${esc(forName())}</span>. You have an idea, a team, and your savings.</p><p>One thing’s missing: compute. Babur will help you make your first GPU deal.</p>` : briefHTML(forName());
    if (ctx.training) $(brief, '.brief-go').innerHTML = 'MEET BABUR <span aria-hidden="true">→</span>';
    $(root, '.office-desk').inert = true;
    brief.hidden = false;
    ctx.audio.rustle();
    $(brief, '.brief-go').focus({ preventScroll: true });
  }
  $(root, '.brief-go').addEventListener('click', () => {
    if (stage !== 'brief') return;
    if (ctx.training) { finish(); return; }
    stage = 'idle';
    const brief = $(root, '.brief');
    brief.classList.add('is-leaving');
    ctx.audio.rustle();
    $(root, '.office-desk').inert = false;
    run();
    setTimeout(() => { brief.hidden = true; brief.classList.remove('is-leaving'); }, calm() ? 120 : 380);
  });

  // ---- Scene 2: the old way -----------------------------------------------------------------------------------
  office.addEventListener('keydown', (e) => {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
  });
  office.addEventListener('click', (e) => {
    if (e.target.closest('button, input, form, .s1, .crt-stage')) return;
    if (stage === 'calls') callBack(e.clientX, e.clientY);    // every click is another call back

  });

  // One slip and a receiver pulse per deliberate click. Six calls close the gag.
  function callBack(clientX, clientY) {
    if (!alive || stage !== 'calls' || performance.now() - lastClick < 450) return;
    lastClick = performance.now();
    clicks += 1;
    const box = slips.getBoundingClientRect();
    tap(clientX - box.left, clientY - box.top);
    const count = 1;
    for (let i = 0; i < count; i++) {
      const x = i === 0 ? clientX - box.left : Math.random() * box.width;
      const y = i === 0 ? clientY - box.top : Math.random() * box.height;
      drop(nextExcuse(), x, y, i * 70);
      if (i > 0 && Math.random() < 0.5) ctx.audio.distantPhone();
    }
    callBacks += count;
    paintCalls(true);
    ctx.audio.slap();
    if (clicks % 6 === 0) ctx.audio.ring(1);
    ringDesk();
    nudge.hidden = true;
    armNudge(2800);
    hint.hidden = false;
    hint.textContent = `${clicks} / 6 calls · Still no compute.`;
    const story = SLIPS[Math.min(clicks - 1, SLIPS.length - 1)];
    $(root, '.cal-week').textContent = `WEEK ${story.week}`;
    $(root, '.t-weeks').textContent = story.week;
    if (clicks === 6) void endCalls();
  }

  // Where you clicked: a ring goes out from the receiver (the click's answer, before the slip lands).
  function tap(x, y) {
    if (calm()) return;
    const t = document.createElement('span');
    t.className = 'tap';
    t.style.left = `${Math.round(x)}px`; t.style.top = `${Math.round(y)}px`;
    $(root, '.taps').appendChild(t);
    setTimeout(() => t.remove(), 520);
  }

  // The hand taps the screen until you start calling, and comes back
  // somewhere new whenever you stop.
  function showNudge() {
    if (!['idle', 'calls'].includes(stage) || nudgeOff) return;
    nudges += 1;
    const first = stage === 'idle';
    $(nudge, '.nudge-label').textContent = first ? `${touch ? 'Tap' : 'Click'} SOURCE COMPUTE` : nudges <= 2 ? `${touch ? 'Tap' : 'Click'} to call them back` : 'Call again?';
    const target = first ? $(root, '.source').getBoundingClientRect() : null, box = office.getBoundingClientRect();
    nudge.style.left = first ? `${((target.left + target.width / 2 - box.left) / box.width * 100).toFixed(1)}%` : `${nudges <= 2 ? 50 : 25 + Math.random() * 50}%`;
    nudge.style.top = first ? `${((target.top + target.height * 0.6 - box.top) / box.height * 100).toFixed(1)}%` : `${nudges <= 2 ? 44 : 22 + Math.random() * 36}%`;
    nudge.hidden = false;
  }
  function armNudge(ms) {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(showNudge, ms);
  }

  // A slip slaps down centered on (x, y), mostly on screen, and settles with a little weight.
  function drop(excuse, x, y, delay = 0) {
    const slip = el(slipHTML(excuse, forName()));
    slip.setAttribute('aria-hidden', 'true');
    slip.style.setProperty('--rot', `${(Math.random() * 24 - 12).toFixed(1)}deg`);
    slip.style.setProperty('--drift', `${(Math.random() * 30 - 15).toFixed(0)}px`);
    if (delay) slip.style.animationDelay = `${delay}ms`;
    slips.appendChild(slip);
    const w = slip.offsetWidth;
    const h = slip.offsetHeight;
    slip.style.left = `${Math.round(Math.max(-w * 0.3, Math.min(slips.clientWidth - w * 0.7, x - w / 2)))}px`;
    slip.style.top = `${Math.round(Math.max(-h * 0.3, Math.min(slips.clientHeight - h * 0.7, y - h / 2)))}px`;
    while (slips.children.length > 170) slips.firstElementChild.remove();
    const now = performance.now();
    if (now - lastRustle > 90) { lastRustle = now; ctx.audio.rustle(); }
  }

  function paintCalls(bump = false) {
    const n = $(root, '.t-calls');
    n.textContent = (calls + callBacks).toLocaleString('en-US');
    if (bump && !calm()) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
  }

  // The desk phone jumps in its cradle.
  function ringDesk() {
    const phone = $(root, '.desk-phone');
    phone.classList.remove('ringing');
    void phone.getBoundingClientRect();
    phone.classList.add('ringing');
  }

  // New lines enter at the bottom and the stack slides up by their height,
  // like a teleprinter feeding paper, instead of jumping a line at a time.
  function feed(text, { loop = false, ms = 420 } = {}) {
    const track = $(root, '.world-track');
    const before = track.offsetHeight;
    track.appendChild(el(`<p class="hl${loop ? ' loop' : ''}">${esc(text)}</p>`));
    const shift = track.offsetHeight - before;
    while (track.children.length > 18) track.firstElementChild.remove();
    if (calm()) return;
    const now = getComputedStyle(track).transform;
    const cur = now && now !== 'none' ? new DOMMatrixReadOnly(now).m42 : 0;
    track.style.transition = 'none';
    track.style.transform = `translateY(${cur + shift}px)`;
    void track.offsetWidth;
    track.style.transition = `transform ${ms}ms ${loop ? 'linear' : 'cubic-bezier(.16, 1, .3, 1)'}`;
    track.style.transform = 'translateY(0)';
  }

  $(root, '.source').addEventListener('click', (e) => {
    if (stage === 'calls') {
      const box = e.currentTarget.getBoundingClientRect();
      callBack(box.x + box.width / 2, box.y + box.height / 2);
    } else run();
  });

  function run() {
    if (!alive || stage !== 'idle') return;
    stage = 'calls';
    office.classList.add('calling');
    $(root, '.source').textContent = 'SECURE COMPUTE';
    $(root, '.source').focus({ preventScroll: true });
    status.hidden = false;
    status.innerHTML = '<p>Call Jim. He knows a guy.</p>';
    tally.hidden = false;
    nudge.hidden = true;
    armNudge(900);
  }

  async function endCalls() {
    // Close input synchronously before any waits: burst clicks cannot start another transition.
    stage = 'world';
    nudgeOff = true;
    clearTimeout(nudgeTimer);
    nudge.hidden = true;
    $(root, '.source').disabled = true;
    $(root, '.op-skip').hidden = true;
    status.innerHTML = '<p>Capacity no longer available.</p>';
    await pause(900, false);
    if (!alive) return;
    const overlay = $(root, '.office-overlay');
    overlay.hidden = false;
    hint.hidden = true;
    office.classList.remove('calling');
    for (const line of ['Oil has a floor.', 'Stocks have a floor.', 'Compute has a floor.']) {
      feed(line);
      await pause(line.startsWith('Compute') ? 3200 : 1500, false);
      if (!alive) return;
    }
    // Let the full line settle before the room fades. No film or event pitch before play.
    office.classList.add('intro-leaving');
    await pause(600, false);
    if (alive) finish();
  }

  // The desk calendar flips a page.
  function flip(node) {
    if (calm()) return;
    node.classList.remove('flip');
    void node.offsetWidth;
    node.classList.add('flip');
  }

  return stop;
}
