// YOUR CORNER OFFICE: the old way. SOURCE: Notion cold open + Act I
// ("Last quarter you called a broker, who called a guy, who said he'd get back
// to you in Q2 next year.") The player clicks SOURCE COMPUTE and watches weeks
// disappear into phone tag. Every click is another call back, and every call
// back gets another excuse: keep clicking and the slips bury the office.

import { BRAND } from '../config.js';
import { el, $, esc, shake, reducedMotion } from '../util.js';

// The story: these arrive on their own, a week at a time.
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

const slipHTML = ({ from, msg, bad }) => `
  <div class="slip${bad ? ' bad' : ''}">
    <div class="slip-h">WHILE YOU WERE OUT</div>
    <div class="slip-row"><b>FOR</b> You</div>
    <div class="slip-row"><b>FROM</b> ${esc(from)}</div>
    <div class="slip-msg">“${esc(msg)}”</div>
    <div class="slip-f">☒ WILL CALL AGAIN</div>
  </div>`;

const SKYLINE = `
<svg class="skyline" viewBox="0 0 800 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <g fill="#2A1E26">
    <rect x="0" y="140" width="60" height="80"/><rect x="55" y="110" width="44" height="110"/>
    <rect x="100" y="150" width="70" height="70"/><rect x="165" y="95" width="38" height="125"/>
    <rect x="200" y="128" width="60" height="92"/>
    <path d="M300 220 L322 40 L326 8 L330 40 L352 220 Z"/>
    <rect x="360" y="120" width="54" height="100"/><rect x="410" y="80" width="46" height="140"/>
    <rect x="452" y="135" width="66" height="85"/><rect x="515" y="100" width="40" height="120"/>
    <rect x="552" y="60" width="52" height="160"/><rect x="600" y="140" width="70" height="80"/>
    <rect x="668" y="112" width="48" height="108"/><rect x="712" y="150" width="88" height="70"/>
  </g>
  <g fill="#FFC979" opacity=".75">
    <rect x="62" y="122" width="4" height="5"/><rect x="74" y="140" width="4" height="5"/><rect x="172" y="110" width="4" height="5"/>
    <rect x="186" y="150" width="4" height="5"/><rect x="420" y="96" width="4" height="5"/><rect x="436" y="128" width="4" height="5"/>
    <rect x="562" y="80" width="4" height="5"/><rect x="580" y="118" width="4" height="5"/><rect x="590" y="96" width="4" height="5"/>
    <rect x="676" y="130" width="4" height="5"/><rect x="522" y="120" width="4" height="5"/><rect x="372" y="140" width="4" height="5"/>
  </g>
</svg>`;

const PHONE = `
<svg class="desk-phone" viewBox="0 0 120 80" aria-hidden="true">
  <path d="M10 70 L22 34 L98 34 L110 70 Z" fill="#D8CCB2" stroke="#1B1814" stroke-width="2"/>
  <rect x="38" y="42" width="44" height="22" rx="3" fill="#C2B594" stroke="#1B1814" stroke-width="1.5"/>
  <g fill="#1B1814">${Array.from({ length: 12 }, (_, i) => `<rect x="${42 + (i % 4) * 10}" y="${45 + Math.floor(i / 4) * 6}" width="6" height="3.5" rx="1"/>`).join('')}</g>
  <path class="handset" d="M14 30 C14 18 22 14 30 14 L90 14 C98 14 106 18 106 30 L94 30 C94 24 90 22 86 22 L34 22 C30 22 26 24 26 30 Z" fill="#E3D8C0" stroke="#1B1814" stroke-width="2"/>
  <path d="M10 64 q-6 4 0 8 q6 4 0 8" fill="none" stroke="#BFB194" stroke-width="2"/>
</svg>`;

// Where the chain's echoes are written: on paper, on phone slips, on screens.
const ECHO_KINDS = ['print', 'print', 'print', 'slip', 'crt'];

export default function office(root, ctx) {
  let alive = true;
  let fast = false;
  let stage = 'idle'; // idle → calls → world → chain → after
  let wake = null;
  let clicks = 0;     // how many times you called back
  let calls = 0;      // calls in the story so far
  let callBacks = 0;  // excuses your call backs got you
  let nudges = 0;     // times the hand has asked
  let nudgeTimer = null;
  let nudgeOff = false;
  const nextExcuse = deck(EXCUSES);
  const calm = reducedMotion();
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  // Waits a click can cut short; `scale` lets a hurried viewer skip ahead.
  const pause = (ms, scale = true) => new Promise((res) => {
    const done = () => { clearTimeout(t); wake = null; res(); };
    const t = setTimeout(done, fast && scale ? ms * 0.3 : ms);
    wake = done;
  });

  root.innerHTML = `
    <div class="office">
      <div class="office-window">
        <div class="sky"></div>${SKYLINE}
        <div class="mullions"></div>
      </div>
      <header class="office-title">
        <p class="kicker ui">YOUR CORNER OFFICE · SAN FRANCISCO · 2026</p>
        <h1 class="hl">Trading compute doesn’t have to be like this.</h1>
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
              <div class="mac-title"><span>Procurement</span></div>
              <div class="mac-body">
                <div class="proc-idle">
                  <p class="proc-need">NEED: 512 × H100 · THIS QUARTER</p>
                  <button class="btn default big source" type="button">SOURCE COMPUTE</button>
                </div>
                <div class="proc-status" hidden></div>
              </div>
            </div>
          </div>
          <div class="computer-chin"><span class="slot"></span></div>
        </div>
        ${PHONE}
      </div>
      <div class="slips" aria-live="polite"></div>
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
          <div class="mail">
            <div class="mag paper">
              <div class="mag-top caps">The mail’s here.</div>
              <div class="mag-cover hl">An ad sticks out.</div>
            </div>
            <button class="btn big ink open-mail" type="button">OPEN THE MAGAZINE</button>
          </div>
        </div>
      </div>
      <button class="linkish skip" type="button">Skip to the floor →</button>
      <p class="hint ui" hidden></p>
    </div>`;

  const office = $(root, '.office');
  const status = $(root, '.proc-status');
  const slips = $(root, '.slips');
  const tally = $(root, '.tally');
  const hint = $(root, '.hint');
  const nudge = $(root, '.nudge');

  const toAd = () => { alive = false; ctx.seenOffice = true; ctx.go('ad'); };
  $(root, '.skip').addEventListener('click', toAd);
  $(root, '.open-mail').addEventListener('click', () => { ctx.audio.slap(); toAd(); });

  office.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (stage === 'calls') callBack(e.clientX, e.clientY);    // every click is another call back
    else if (stage === 'chain') { stage = 'after'; wake?.(); } // a click breaks the chain early
    else if (stage === 'world' || stage === 'after') { fast = true; wake?.(); }
  });

  // You call back and get another excuse. The more you call, the more you get:
  // one slip per click at first, up to four once you're 24 calls deep.
  function callBack(clientX, clientY) {
    clicks += 1;
    const box = slips.getBoundingClientRect();
    const count = Math.min(4, 1 + Math.floor(clicks / 8));
    for (let i = 0; i < count; i++) {
      const x = i === 0 ? clientX - box.left : Math.random() * box.width;
      const y = i === 0 ? clientY - box.top : Math.random() * box.height;
      drop(nextExcuse(), x, y);
      if (i > 0 && Math.random() < 0.5) ctx.audio.distantPhone();
    }
    callBacks += count;
    paintCalls();
    ctx.audio.slap();
    if (clicks % 6 === 0) ctx.audio.ring(1);
    ringDesk();
    nudge.hidden = true;
    armNudge(2800);
    hint.hidden = false;
    hint.textContent = clicks >= 40 ? 'Any minute now.' : clicks >= 15 ? 'They’ll get back to you.' : 'Keep calling.';
  }

  // The hand taps the screen until you start calling, and comes back
  // somewhere new whenever you stop.
  function showNudge() {
    if (stage !== 'calls' || nudgeOff) return;
    nudges += 1;
    $(nudge, '.nudge-label').textContent = nudges === 1 ? `${touch ? 'Tap' : 'Click'} to call them back` : 'Call again?';
    nudge.style.left = `${nudges === 1 ? 50 : 25 + Math.random() * 50}%`;
    nudge.style.top = `${nudges === 1 ? 44 : 22 + Math.random() * 36}%`;
    nudge.hidden = false;
  }
  function armNudge(ms) {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(showNudge, ms);
  }

  // A slip slaps down centered on (x, y), mostly on screen.
  function drop(excuse, x, y) {
    const slip = el(slipHTML(excuse));
    slip.setAttribute('aria-hidden', 'true');
    slip.style.setProperty('--rot', `${(Math.random() * 24 - 12).toFixed(1)}deg`);
    slips.appendChild(slip);
    const w = slip.offsetWidth;
    const h = slip.offsetHeight;
    slip.style.left = `${Math.round(Math.max(-w * 0.3, Math.min(slips.clientWidth - w * 0.7, x - w / 2)))}px`;
    slip.style.top = `${Math.round(Math.max(-h * 0.3, Math.min(slips.clientHeight - h * 0.7, y - h / 2)))}px`;
    while (slips.children.length > 170) slips.firstElementChild.remove();
  }

  function paintCalls() {
    $(root, '.t-calls').textContent = (calls + callBacks).toLocaleString('en-US');
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
    if (calm) return;
    const now = getComputedStyle(track).transform;
    const cur = now && now !== 'none' ? new DOMMatrixReadOnly(now).m42 : 0;
    track.style.transition = 'none';
    track.style.transform = `translateY(${cur + shift}px)`;
    void track.offsetWidth;
    track.style.transition = `transform ${ms}ms ${loop ? 'linear' : 'cubic-bezier(.16, 1, .3, 1)'}`;
    track.style.transform = 'translateY(0)';
  }

  // Stop the stack exactly where it is.
  function freeze() {
    const track = $(root, '.world-track');
    const now = getComputedStyle(track).transform;
    track.style.transition = 'none';
    track.style.transform = now === 'none' ? '' : now;
  }

  // One more "who knows a guy", somewhere in the room.
  function echo(layer, heat) {
    const s = document.createElement('span');
    s.className = `echo echo-${ECHO_KINDS[Math.floor(Math.random() * ECHO_KINDS.length)]}`;
    s.textContent = BRAND.worldLoop;
    const fit = Math.max(0.55, Math.min(1, window.innerWidth / 1100));
    const size = Math.round((14 + Math.random() * (16 + heat * 58)) * fit);
    s.style.cssText = [
      `left:${(Math.random() * 96 - 8).toFixed(1)}%`,
      `top:${(Math.random() * 98 - 2).toFixed(1)}%`,
      `font-size:${size}px`,
      `--r:${(Math.random() * 20 - 10).toFixed(1)}deg`,
      `--o:${(0.14 + Math.random() * (0.22 + heat * 0.5)).toFixed(2)}`,
      `--d:${(Math.random() * 0.22).toFixed(2)}s`,
    ].join(';');
    layer.appendChild(s);
    if (layer.children.length > 90) layer.firstElementChild.remove();
    if (Math.random() < 0.3) ctx.audio.distantPhone();
  }

  // "Who knows a guy", again and again, each time sooner, while the same words
  // pile up across the room and the phones won't stop, until time runs out or
  // the viewer clicks.
  async function chain(overlay) {
    const back = $(root, '.chorus.back');
    const front = $(root, '.chorus.front');
    const span = fast ? 3000 : 5200;
    let gap = calm ? 650 : 720;
    stage = 'chain';
    ctx.audio.openChorus(span / 1000 + 0.5);
    const t0 = performance.now();
    for (let n = 1; stage === 'chain' && alive; n++) {
      const elapsed = performance.now() - t0;
      if (calm ? n > 6 : elapsed >= span) break;
      const heat = calm ? 0 : Math.min(1, elapsed / span);
      feed(BRAND.worldLoop, { loop: true, ms: Math.min(320, gap * 0.9) });
      ctx.audio.blip(420 + heat * 980, 0.02 + heat * 0.025);
      if (n % 3 === 0 && n <= 21) ctx.audio.ring(1);
      if (!calm) {
        const copies = heat < 0.12 ? 0 : Math.ceil(heat * 3.4);
        for (let i = 0; i < copies; i++) echo(heat > 0.6 && Math.random() < 0.4 ? front : back, heat);
        overlay.classList.toggle('frenzy', heat > 0.55);
      }
      await pause(gap, false);
      gap = Math.max(calm ? 650 : 45, gap * 0.8);
    }
    stage = 'after';
  }

  $(root, '.source').addEventListener('click', run);

  async function run() {
    stage = 'calls';
    office.classList.add('calling');
    $(root, '.proc-idle').hidden = true;
    status.hidden = false;
    status.innerHTML = '<p class="blink">Calling your broker…</p>';
    tally.hidden = false;
    armNudge(700);
    ctx.audio.ring(1);
    await pause(1500);
    if (!alive) return;

    // The story slips land on the desk, spread across its width.
    for (let i = 0; i < SLIPS.length; i++) {
      const s = SLIPS[i];
      const slip = el(slipHTML(s));
      slip.style.setProperty('--rot', `${(Math.random() * 14 - 7).toFixed(1)}deg`);
      slip.style.left = `${(3 + (6 + ((i * 37) % 70) + Math.random() * 8) * 0.94).toFixed(1)}%`;
      slip.style.top = `${(58 + (4 + ((i * 23) % 42) + Math.random() * 6) * 0.4).toFixed(1)}%`;
      slips.appendChild(slip);
      ctx.audio.slap();
      if (i % 3 === 1) ctx.audio.ring(1);
      $(root, '.cal-week').textContent = `WEEK ${s.week}`;
      $(root, '.cal-sub').textContent = s.week >= 7 ? 'Quarter’s over' : 'Still sourcing';
      $(root, '.t-weeks').textContent = s.week;
      calls = s.calls;
      paintCalls();
      status.innerHTML = `<p>${s.bad ? '<b>Capacity no longer available.</b>' : 'Waiting for a call back…'}</p>`;
      await pause(s.bad ? 1700 : 1050);
      if (!alive) return;
    }

    // The screen surfaces through the pile with the verdict.
    status.innerHTML = `
      <div class="mac-alert"><span class="stop">!</span><p>Capacity no longer available.<br><small>Should’ve closed.</small></p></div>`;
    $(root, '.computer').classList.add('surface');
    nudgeOff = true;
    clearTimeout(nudgeTimer);
    nudge.hidden = true;
    ctx.audio.buzz();
    await pause(1600);
    if (!alive) return;

    // Oil has a floor. Stocks have a floor. Compute has a guy who knows a guy…
    stage = 'world';
    office.classList.remove('calling');
    const overlay = $(root, '.office-overlay');
    overlay.hidden = false;
    hint.hidden = true;
    for (const line of BRAND.worldLine) {
      feed(line);
      ctx.audio.blip(660, 0.03);
      await pause(fast ? 750 : 1100, false);
      if (!alive) return;
    }

    // …who knows a guy, who knows a guy, who knows a guy…
    await chain(overlay);
    if (!alive) return;

    // The break: everything stops dead and goes quiet, the line lands, and the
    // whole pile falls off the screen.
    ctx.audio.cutChorus();
    overlay.classList.remove('frenzy');
    freeze();
    await pause(140, false);
    if (!alive) return;
    $(root, '.better').classList.add('show');
    overlay.classList.add('broken');
    ctx.audio.stamp();
    shake(office);
    await pause(1500);
    if (!alive) return;
    $(root, '.mail').classList.add('show');
    ctx.audio.slap();
  }

  return () => { alive = false; stage = 'after'; wake?.(); clearTimeout(nudgeTimer); ctx.audio.cutChorus(); };
}
