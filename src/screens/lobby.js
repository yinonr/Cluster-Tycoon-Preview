// THE FRONT DOOR → THE FLOOR. SOURCE: Notion Act II ("A clerk scans your
// pass ... hands you your badge on a lanyard in your side's color" ... "At noon
// the bell rings and the market opens.")

import { BRAND } from '../config.js';
import { $, esc, int, wait } from '../util.js';

export default function lobby(root, ctx) {
  const run = ctx.run;
  const md = run.mandate;
  let alive = true;
  root.innerHTML = `
    <div class="lobby">
      <p class="lobby-where ui">${esc(BRAND.venue.toUpperCase())} · 11:58 AM</p>
      <div class="badge-drop side-buy">
        <div class="strap"></div>
        <div class="badge-card">
          <div class="badge-band">${run.kind === 'venture' ? `FOUNDER · Q${run.q}` : 'BUYER'}</div>
          <div class="badge-body">
            ${run.playerName ? `<div class="badge-person hl">${esc(run.playerName)}</div><div class="badge-name">${esc(md.company)}</div>` : `<div class="badge-person hl">${esc(md.company)}</div>`}
            <div class="badge-no ui">${esc(run.badgeNo)} · PADDLE ${run.paddle}</div>
            <div class="badge-mark hl-cond">${esc(BRAND.wordmark)}</div>
          </div>
        </div>
      </div>
      <p class="lobby-line">The clerk already knows your name.</p>
      <button class="btn big ink walk-in" type="button">WALK ONTO THE FLOOR</button>

      <div class="doors" hidden>
        <div class="hall-glimpse">
          <div class="glow"></div>
          <div class="crowd"></div>
        </div>
        <div class="door left"><span class="pull"></span><span class="door-mark hl-cond">HAIGHT STREET</span></div>
        <div class="door right"><span class="pull"></span><span class="door-mark hl-cond">COMPUTE</span></div>
        <div class="market-open">
          <div class="mo-kicker ui">${esc(BRAND.wordmark)} · NOON</div>
          <h1 class="hl-cond">Market open</h1>
          <p>Need ${int(md.qty)} ${esc(md.gpu)}s before the bell? Find someone who has them.</p>
        </div>
      </div>
    </div>`;

  const enter = async () => {
    const doors = $(root, '.doors');
    doors.hidden = false;
    ctx.audio.slap();
    await wait(450);
    if (!alive) return;
    doors.classList.add('open');
    ctx.audio.bell({ strikes: 3 });
    await wait(2700);
    if (alive) ctx.go('floor');
  };
  $(root, '.walk-in').addEventListener('click', enter);
  root.addEventListener('click', (e) => {
    if ($(root, '.doors').classList.contains('open') && !e.target.closest('.chrome')) { alive = false; ctx.go('floor'); }
  });
  return () => { alive = false; };
}
