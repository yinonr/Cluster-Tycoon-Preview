// THE MAIN PAGE (Deal Lab, V3 experiment): the ad's right-hand page on its own,
// with one unmistakable action. No story, no classifieds, no coupon, no letter,
// no lobby: START TRADING puts you on the floor. Brand copy is the ad's (config.js,
// from Notion). Venture Mode and today's official floor stay one click away.

import { BRAND } from '../config.js';
import { $, esc, dotted } from '../util.js';
import { FACADE } from './ad.js';

export default function home(root, ctx) {
  const v = ctx.venture.state;
  const live = v && !v.dev && v.phase !== 'over';
  // THE TYCOON (V6): START TRADING begins a run; a run in progress continues where it stopped.
  const ty = ctx.tycoon.state;
  const tyLive = ty && ty.phase !== 'over' && ty.report;
  root.innerHTML = `
    <div class="spread solo">
      <article class="page page-ad paper home">
        ${BRAND.logoSrc ? `<img class="ad-logo" src="${esc(BRAND.logoSrc)}" alt="${esc(BRAND.name)}">` : ''}
        ${FACADE}
        <h1 class="ad-hl hl">${esc(BRAND.adHeadline)}</h1>
        ${BRAND.adBody.map((p) => `<p class="ad-body">${esc(p)}</p>`).join('')}
        <div class="ad-sign">
          <span class="wordmark hl-cond">${esc(BRAND.wordmark)}</span>
          <span class="ad-where caps">${dotted([BRAND.venue, BRAND.city, BRAND.eventDate || BRAND.eventMonth])}</span>
        </div>
        <div class="home-go">
          <button class="btn big spot start" type="button">${tyLive ? `CONTINUE · QUARTER ${ty.q}` : 'START TRADING'}</button>
          <p class="home-lab ui">THE TYCOON · buy compute, cut deals, back startups · quarter after quarter · saved on this device</p>
          ${tyLive ? '<button class="linkish fresh" type="button">Or start a new run →</button>' : ''}
        </div>
        <div class="home-more">
          <button class="linkish venture" type="button">${live ? `Back to ${esc(v.player.firm)} · quarter ${v.q} of 6 →` : 'Or run a company for six quarters →'}</button>
          <button class="linkish daily" type="button">Today’s official floor →</button>
        </div>
      </article>
    </div>`;

  $(root, '.start').addEventListener('click', () => {
    ctx.audio.slap?.();
    if (tyLive) { ctx.go('cycle'); return; }
    ctx.newTycoon();
    ctx.go('floor');
  });
  const fresh = $(root, '.fresh');
  fresh?.addEventListener('click', () => {
    if (!fresh.classList.contains('armed')) { fresh.classList.add('armed'); fresh.textContent = `Sure? Quarter ${ty.q}'s run ends unscored. Click again →`; return; }
    ctx.newTycoon();
    ctx.go('floor');
  });
  $(root, '.venture').addEventListener('click', () => {
    if (!live) ctx.startVenture();
    ctx.go(ctx.ventureScreen());
  });
  $(root, '.daily').addEventListener('click', () => { ctx.skippedOffice = true; ctx.go('ad'); });
  setTimeout(() => $(root, '.start')?.focus({ preventScroll: true }), 50);
}
