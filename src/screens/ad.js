// THE AD + COUPON. SOURCE: Notion cold open ("No more GPU clusterf---s.") and
// Act I (mail-in coupon; "you declare your side of the market: buying,
// selling, investing, or raising"). The coupon doubles as the persona select.

import { BRAND } from '../config.js';
import { PERSONAS } from '../data/personas.js';
import { $, $$, esc, dotted, int } from '../util.js';
import { today } from '../daily.js';
import { ctaUrl } from '../share/links.js';
import { rivalName } from '../share/text.js';

export const FACADE = `
<svg class="facade" viewBox="0 0 400 230" aria-hidden="true">
  <rect x="0" y="0" width="400" height="230" fill="none"/>
  <path d="M20 66 L380 66 L380 54 L200 20 L20 54 Z" fill="none" stroke="#1B1814" stroke-width="2.5"/>
  <rect x="30" y="66" width="340" height="22" fill="none" stroke="#1B1814" stroke-width="2"/>
  <text x="200" y="82" text-anchor="middle" class="facade-text">HAIGHT STREET COMPUTE</text>
  ${[0, 1, 2, 3, 4, 5].map((i) => {
    const x = 52 + i * 59;
    return `<g stroke="#1B1814" stroke-width="2" fill="none">
      <path d="M${x - 11} 96 q-5 -6 3 -8 h16 q8 2 3 8"/>
      <rect x="${x - 9}" y="96" width="18" height="96"/>
      <path d="M${x - 4} 100 V188 M${x + 1} 100 V188 M${x + 6} 100 V188" stroke-width=".8"/>
      <rect x="${x - 12}" y="192" width="24" height="7"/>
    </g>`;
  }).join('')}
  <rect x="18" y="199" width="364" height="10" fill="none" stroke="#1B1814" stroke-width="2"/>
  <rect x="8" y="209" width="384" height="12" fill="none" stroke="#1B1814" stroke-width="2"/>
  <path d="M184 192 V150 Q200 132 216 150 V192" fill="none" stroke="#1B1814" stroke-width="2"/><path d="M200 140 V192" stroke="#1B1814" stroke-width="1.2"/>
  <circle cx="200" cy="44" r="9" fill="none" stroke="#1B1814" stroke-width="2"/>
  <path d="M200 38 v6 l4 3" stroke="#1B1814" stroke-width="1.6" fill="none"/>
</svg>`;

export default function ad(root, ctx) {
  const draft = BRAND.showDraftMarkers && !BRAND.eventDate;
  const sides = PERSONAS.filter((p) => p.coupon);
  const broker = PERSONAS.find((p) => p.id === 'broker');
  const mag = BRAND.magazine;

  root.innerHTML = `
    ${ctx.skippedOffice ? '<div class="ad-top"><button class="linkish intro-again" type="button">↺ Watch the intro</button></div>' : ''}
    <div class="spread">
      <article class="page page-left paper">
        <p class="mag-folio caps">${esc(mag.folio)}</p>
        <h3 class="hl">${esc(mag.headline)}</h3>
        ${mag.body.map((text) => `<p class="col">${esc(text)}</p>`).join('')}
        <div class="col-rule"></div>
        <p class="col small mag-jump">${esc(mag.continued[0])}<a href="${esc(ctaUrl())}" target="_blank" rel="noopener">${esc(mag.continued[1])}</a>${esc(mag.continued[2])}</p>
        <div class="classifieds">
          <div class="cl-h caps">Classifieds</div>
          <p><b>FOR SALE.</b> Fourteen desk phones, gently used. Hold music included. Box 1124.</p>
          <p><b>WANTED.</b> Rack space, any city, this quarter. Will not accept “Q2” as an answer. Box 2207.</p>
          <p><b>LOST.</b> One H100 cluster, last seen in a spreadsheet tab marked FINAL_v7. Reward.</p>
        </div>
      </article>
      <article class="page page-ad paper">
        ${BRAND.logoSrc ? `<img class="ad-logo" src="${esc(BRAND.logoSrc)}" alt="${esc(BRAND.name)}">` : ''}
        ${FACADE}
        <h1 class="ad-hl hl">${esc(BRAND.adHeadline)}</h1>
        ${BRAND.adBody.map((p) => `<p class="ad-body">${esc(p)}</p>`).join('')}
        <div class="ad-sign">
          <span class="wordmark hl-cond">${esc(BRAND.wordmark)}</span>
          <span class="ad-where caps">${dotted([BRAND.venue, BRAND.city, BRAND.eventDate || BRAND.eventMonth])}${draft ? ' <i class="draft">date tbc</i>' : ''}</span>
        </div>
        ${challengeSlip(ctx)}
        ${ventureSlip(ctx)}
        <form class="coupon" novalidate>
          <div class="coupon-cut" aria-hidden="true">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
          ${ctx.challenge ? '' : dailyLine(ctx)}
          <div class="coupon-row">
            <label for="coupon-name">Name</label>
            <input id="coupon-name" class="coupon-fill" type="text" maxlength="40" autocomplete="name" placeholder="Your name" value="${esc(ctx.player.name)}">
            <label for="coupon-firm">Firm</label>
            <input id="coupon-firm" class="coupon-fill" type="text" maxlength="32" autocomplete="organization" placeholder="Your startup" value="${esc(ctx.player.firm)}">
          </div>
          <fieldset class="coupon-sides">
            <legend>I’m there to:</legend>
            ${sides.map((p) => `
              <label class="side-box side-${p.side} ${p.playable ? '' : 'locked'}">
                <input type="radio" name="side" value="${p.id}" ${p.playable ? '' : 'data-locked="1"'}>
                <span class="box" aria-hidden="true"></span>
                <span class="side-name">${esc(p.coupon)}</span>
                ${p.playable ? '' : '<span class="next caps">next session</span>'}
              </label>`).join('')}
          </fieldset>
          ${ctx.challenge ? '' : `
          <fieldset class="coupon-long">
            <legend>How long?</legend>
            <label class="long-box"><input type="radio" name="long" value="day" checked><span class="box" aria-hidden="true"></span> One afternoon <span class="muted">· today’s floor</span></label>
            <label class="long-box"><input type="radio" name="long" value="venture"><span class="box" aria-hidden="true"></span> Six quarters <span class="muted">· run the company</span></label>
          </fieldset>`}
          <p class="coupon-note" aria-live="polite"></p>
          <div class="coupon-foot">
            <span class="coupon-small">${esc(BRAND.adFootnote)} · The house reads every request.</span>
            <button class="btn ink big mail-it" type="submit" disabled>MAIL IT</button>
          </div>
          <p class="coupon-broker">Brokers work for the house. <span class="caps next">next session</span></p>
        </form>
      </article>
    </div>`;

  const form = $(root, '.coupon');
  const note = $(root, '.coupon-note');
  const mailIt = $(root, '.mail-it');

  $$(root, 'input[name=side]').forEach((input) => {
    input.addEventListener('change', () => {
      const p = PERSONAS.find((x) => x.id === input.value);
      ctx.audio.tap();
      if (input.dataset.locked) {
        input.checked = false;
        note.innerHTML = `<b>${esc(p.title)}.</b> Opens in a future session. ${esc(p.teaser)}`;
        mailIt.disabled = !form.querySelector('input[name=side]:checked');
        return;
      }
      note.innerHTML = `<b>${esc(p.title)}.</b> ${esc(p.teaser)}`;
      mailIt.disabled = false;
    });
  });

  $(root, '.coupon-broker .next').title = broker.teaser;

  let replaceArmed = false;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const chosen = form.querySelector('input[name=side]:checked');
    if (!chosen) return;
    const long = form.querySelector('input[name=long]:checked');
    const venture = !ctx.challenge && long && long.value === 'venture';
    // A new company replaces the one in progress: ask once.
    const active = ctx.venture.state;
    if (venture && active && active.phase !== 'over' && !active.dev && !replaceArmed) {
      replaceArmed = true;
      note.innerHTML = `<b>This starts a new company.</b> ${esc(active.player.firm)} (quarter ${active.q} of 6) will be closed for good. Mail it again to confirm, or use the slip above to go back.`;
      ctx.audio.buzz();
      return;
    }
    ctx.persona = chosen.value;
    ctx.setPlayer({
      name: $(root, '#coupon-name').value.trim(),
      firm: $(root, '#coupon-firm').value.trim(),
    });
    ctx.audio.slap();
    if (venture) { ctx.startVenture(); ctx.go('hq'); return; }
    ctx.firstRun();
    ctx.go('sheet');
  });
  $(root, '.venture-back')?.addEventListener('click', () => ctx.go(ctx.ventureScreen()));
  $$(root, 'input[name=long]').forEach((input) => input.addEventListener('change', () => { replaceArmed = false; ctx.audio.tap(); }));

  $(root, '.intro-again')?.addEventListener('click', () => ctx.go('office'));
}

// Today's floor on the coupon: whether this device has played it yet.
function dailyLine(ctx) {
  const d = today(ctx.mode.rulesVersion ?? 1);
  const e = ctx.stats.daily(d.iso);
  const streak = ctx.stats.streak(d.day);
  const status = !e ? 'Your first run counts.'
    : e.state === 'done' ? `Played: ${e.rating === 'NO FILL' ? 'no fill' : `${esc(e.rating)} · ${int(e.score)}`}. The next floor opens at midnight in San Francisco. Mail it to practice.`
      : 'You walked out. It still counts. Mail it to practice.';
  return `<p class="coupon-daily"><b>Today’s floor · <span class="nowrap">${esc(d.label)}</span></b> · ${esc(d.line)} · ${status}${streak > 1 ? ` <span class="streak">${streak} days running</span>` : ''}</p>`;
}

// A friend's challenge, pinned above the coupon.
function challengeSlip(ctx) {
  const ch = ctx.challenge;
  if (!ch) return '';
  if (!ch.sameRules) {
    return `<p class="challenge-slip"><span class="cs-h ui">A CHALLENGE</span>This link is from an older version of the floor. Play it anyway; scores won’t be compared.</p>`;
  }
  const name = `<bdi>${esc(rivalName(ch))}</bdi>`;
  const tries = ch.tries > 1 ? `after ${int(ch.tries)} tries` : 'first try';
  const d = ch.daily;
  const isToday = d && d.iso === today(ctx.mode.rulesVersion ?? 1).iso;
  const mine = d && ctx.stats.daily(d.iso);
  const label = d && `<span class="nowrap">${esc(d.label)}</span>`;
  const floor = d ? (isToday ? ` on today’s floor, ${label}` : ` on floor ${label}`) : ' on this need sheet';
  const note = !isToday ? ''
    : !mine ? ' It counts as your run for today.'
      : mine.state === 'done' ? ` You already played it${mine.rating === 'NO FILL' ? '' : ` (${int(mine.score)})`}, so this run is practice.`
        : ' You walked out of it earlier, so this run is practice.';
  return `<p class="challenge-slip"><span class="cs-h ui">A CHALLENGE</span><b>${name}</b> scored <b>${int(ch.score)}</b>${floor} (${tries}). Your paddle.${note ? `<span class="cs-mine">${note}</span>` : ''}</p>`;
}

// A company in progress (Venture Mode): back to the office in one click.
function ventureSlip(ctx) {
  const s = ctx.venture.state;
  if (!s || s.dev || ctx.challenge) return '';
  if (s.phase === 'over') {
    const ex = s.exit;
    return `<p class="challenge-slip venture-slip"><span class="cs-h ui">YOUR LAST COMPANY</span><b>${esc(s.player.firm)}</b> · ${ex.soldForParts ? 'sold for parts' : `${esc(ex.tier.toLowerCase())} · your stake $${(ex.stake / 1e6).toFixed(1)}M`} <button class="btn ink venture-back" type="button">THE FRONT PAGE →</button></p>`;
  }
  return `<p class="challenge-slip venture-slip"><span class="cs-h ui">YOUR COMPANY</span><b>${esc(s.player.firm)}</b> · quarter ${s.q} of 6 · cash $${(s.cash / 1e6).toFixed(1)}M <button class="btn ink venture-back" type="button">BACK TO THE OFFICE →</button></p>`;
}
