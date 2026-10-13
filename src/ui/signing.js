// THE SIGNING ROOM. SOURCE: Notion Act III ("A lawyer is waiting and the
// contract is already printed. You read it and you sign. The price agreed on
// the floor is now owed. On the board, a fill goes up.")
// Printer feeds → you sign → the stamp lands → the bell → the fill posts.

import { BRAND } from '../config.js';
import { el, $, esc, int, usd, wait, shake, wallClock } from '../util.js';
import { FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR } from '../config.js';

export function openSigning(host, { ctx, run, deal, filled, need, onDone, quick = false, next = null }) {
  const m = run.market;
  const rows = ctx.mode.contract(run, deal);
  const when = wallClock(m.t, m.duration, FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR).label;
  let fast = quick; // quick: the contract prints at once (you still sign it)
  let alive = true;

  const lines = [
    `${BRAND.wordmark}`,
    'STANDARD COMPUTE CAPACITY CONTRACT',
    'FORM HSC-1 · PROTOTYPE · FICTIONAL',
    '-'.repeat(38),
    ...rows.map(([k, v]) => `${(k + ' ').padEnd(16, '.')} ${v}`),
    '-'.repeat(38),
    '[X] COUNTERPARTY VETTED BY THE HOUSE',
    '[X] LOT CONFIRMED BEFORE THE FLOOR',
    '[X] STANDARD TERMS, PRE-AGREED',
    '[X] NO NDA. NO CALL SCHEDULED.',
    'BINDING, SUBJECT TO 7-DAY CONFIRMATORY DILIGENCE',
    `SIGNED ON THE FLOOR · ${when}`,
  ];

  const node = el(`
    <div class="signing" role="dialog" aria-modal="true" aria-label="Signing room">
      <div class="sign-room">
        <div class="sign-kicker ui">THE SIGNING ROOM · ${esc(when)}</div>
        <div class="counsel ui">Counsel is waiting. The contract is already printed.</div>
        <div class="printer beige"><span class="printer-slot"></span><span class="printer-led"></span></div>
        <div class="contract tractor green-bar">
          <pre class="contract-text"></pre>
          <div class="sign-line">
            <span class="x">✕</span>
            <svg class="sig" viewBox="0 0 300 70" aria-hidden="true"><path d="M10 52 C 18 14, 34 8, 30 36 C 27 58, 44 22, 52 30 C 59 37, 51 51, 62 46 C 73 41, 70 25, 80 30 C 90 35, 83 50, 95 45 C 107 40, 104 24, 115 29 C 127 34, 119 52, 133 46 C 147 40, 151 18, 156 30 C 160 40, 152 52, 166 46 C 182 39, 176 30, 190 34 C 204 38, 196 52, 214 46 C 236 38, 252 28, 288 24 M 36 60 C 110 66, 200 62, 290 54"/></svg>
            <span class="sign-label">${run.playerName ? `${esc(run.playerName)} · ` : ''}${esc(run.mandate.company)}</span>
          </div>
          <div class="confirm-stamp stamp" hidden style="--rot:-11deg">TRADE CONFIRMED</div>
        </div>
        <div class="sign-actions">
          <button class="btn big default spot sign-it" type="button" hidden>SIGN IT</button>
        </div>
        <div class="sign-after" hidden>
          <div class="lab-grade" hidden></div>
          <p class="owed hl">The price agreed on the floor is now owed.</p>
          <p class="fill-line ui"></p>
          <button class="btn big ink back" type="button"></button>
        </div>
      </div>
    </div>`);
  host.appendChild(node);
  const pre = $(node, '.contract-text');
  node.addEventListener('click', (e) => { if (!e.target.closest('button')) fast = true; });

  (async () => {
    ctx.audio.printer(1.8);
    for (const line of lines) {
      pre.textContent += line + '\n';
      if (!fast) await wait(85);
      if (!alive) return;
    }
    const btn = $(node, '.sign-it');
    btn.hidden = false;
    btn.focus({ preventScroll: true });
    btn.addEventListener('click', sign, { once: true });
  })();

  async function sign() {
    $(node, '.sign-it').hidden = true;
    node.classList.add('signed');
    ctx.audio.scratch(0.8);
    await wait(fast ? 300 : 750);
    if (!alive) return;
    const stamp = $(node, '.confirm-stamp');
    stamp.hidden = false;
    stamp.classList.add('stamp-in');
    ctx.audio.stamp();
    shake($(node, '.sign-room'));
    await wait(300);
    if (!alive) return;
    ctx.audio.bell({ strikes: 2 });
    await wait(500);
    const after = $(node, '.sign-after');
    // Deal Lab: the deal's grade lands on the contract (modes without a stamp show nothing).
    const st = ctx.mode.stamp ? ctx.mode.stamp(run, deal) : null;
    if (st) {
      const g = $(node, '.lab-grade');
      g.hidden = false;
      g.innerHTML = `<span class="stamp lab-stamp g-${esc(st.grade)} stamp-in" style="--rot:-7deg">${esc(st.label)}</span><span class="lab-pts hl">${st.pts < 0 ? '−' : '+'}${int(Math.abs(st.pts))}</span><span class="lab-line ui">${esc(st.line)}</span>${st.note ? `<span class="lab-note">${esc(st.note)}</span>` : ''}`;
      ctx.audio.stamp();
    }
    after.hidden = false;
    $(node, '.fill-line').textContent = `ON THE BOARD: FILL ${int(deal.qty)} ${deal.gpu} ${deal.site} ${deal.term}M ${usd(deal.rate)} · NO NAMES`;
    const back = $(node, '.back');
    back.textContent = next || (filled ? 'NEED SHEET FILLED · SEE THE TAPE →'
      : need > 0 ? `BACK TO THE FLOOR · ${int(need)} TO GO`
        : deal.optional ? 'OPTIONAL TRADE · BACK TO THE FLOOR' : 'NEED MET · BACK TO THE FLOOR');
    back.focus({ preventScroll: true });
    back.addEventListener('click', () => { close(); onDone(); }, { once: true });
  }

  function close() {
    alive = false;
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 200);
  }

  return { close };
}
