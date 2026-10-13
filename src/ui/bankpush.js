// BANK OR PUSH (Deal Lab): the need sheet is filled. Bank the score and see the
// tape, or push for one more deal: a startup's order, from the one seller who has
// it, before another broker gets there. Both sides of the bet are on the card
// before you choose. The floor waits while it's open.

import { figureSVG } from './character.js';
import { el, $, esc, int, usd, wallClock } from '../util.js';
import { FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR } from '../config.js';

export function openBankOrPush(host, { ctx, run, offer: o, onBank, onPush }) {
  const m = run.market;
  const when = wallClock(m.t, m.duration, FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR).label;
  const node = el(`
    <div class="bp-scrim">
      <div class="bp-card paper" role="dialog" aria-modal="true" aria-labelledby="bp-h">
        <div class="bp-kicker ui">NEED MET · ${esc(when)}</div>
        <h2 class="bp-h hl-cond" id="bp-h">Bank it, or push?</h2>
        <div class="bp-cols">
          <section class="bp-bank">
            <div class="bp-label ui">BANK</div>
            <div class="bp-num hl">${int(o.bank)}</div>
            <p>Lock in your lab score and see the tape.</p>
            <button class="btn big ink bp-bank-go" type="button">BANK ${int(o.bank)}</button>
          </section>
          <section class="bp-push">
            <div class="bp-label ui">PUSH · ONE MORE DEAL</div>
            <p class="bp-order"><b>${esc(o.client)}</b> needs <b>${int(o.qty)} ${esc(o.gpu)}</b> today, ${o.term} months, and pays <b>${usd(o.price)}</b>/GPU-hr.</p>
            <div class="bp-seller side-sell">
              <span class="bp-fig">${figureSVG({ look: o.dressed })}</span>
              <p><b>${esc(o.seller)} · ${esc(o.firm)}</b> has them, posted <b>${usd(o.posted)}</b>. <span class="bp-shout">“${esc(o.shout)}”</span></p>
            </div>
            <ul class="bp-rules">
              <li class="ok">Every cent under ${usd(o.price)}: <b>+${int(o.perCent)}</b>, up to +${int(o.cap)}.</li>
              <li class="no">Every cent over: <b>−${int(o.perCent)}</b>. No deal in ${Math.round(o.window)} seconds: <b>−${int(o.stake)}</b>. Never worse than −${int(o.stake)}.</li>
            </ul>
            <button class="btn big spot bp-push-go" type="button">PUSH · RISK ${int(o.stake)}</button>
          </section>
        </div>
      </div>
    </div>`);
  host.appendChild(node);
  let done = false;
  const choose = (fn) => () => {
    if (done) return;
    done = true;
    ctx.audio.slap?.();
    node.remove();
    fn();
  };
  $(node, '.bp-bank-go').addEventListener('click', choose(onBank));
  $(node, '.bp-push-go').addEventListener('click', choose(onPush));
  ctx.audio.bell?.({ strikes: 2 });
  setTimeout(() => $(node, '.bp-bank-go')?.focus({ preventScroll: true }), 50);
  return { close: () => { done = true; node.remove(); } };
}
