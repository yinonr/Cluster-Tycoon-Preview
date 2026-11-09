// Evan, the technical co-founder: GPUs, racks, networking, deployments and the three games.
import { esc } from '../util.js';

// Approved art (docs/v221/EVAN_ASSETS.md), cut from the approved sheet by tools/v221-qa/cut-evan.mjs.
const art = name => new URL(`../../assets/evan/${name}.png`, import.meta.url).href;
export const EVAN_ART = Object.freeze({ neutral: art('evan-neutral'), explaining: art('evan-explaining'), celebrating: art('evan-celebrating') });

// Warm the three portraits once at startup so Evan's first line paints his face immediately (an async
// first decode otherwise lands a frame or more after the dialogue appears).
export function preloadEvan() {
  if (typeof Image !== 'function') return;
  for (const src of Object.values(EVAN_ART)) { const i = new Image(); i.decoding = 'async'; i.src = src; i.decode?.().catch(() => {}); preloadEvan.kept.push(i); }
}
preloadEvan.kept = [];
// V24: `phone` is the same instruction worded for the compact (≤768 px) layout; CSS shows one of the two.
const wording = (line, phone) => phone ? `<span class="say-wide">${esc(line)}</span><span class="say-phone">${esc(phone)}</span>` : esc(line);
export function evanSays(line, { small = false, expression = 'neutral', phone = '' } = {}) {
  const src = EVAN_ART[expression] || EVAN_ART.neutral;
  return `<aside class="evan-guide ${small ? 'is-small' : ''}" aria-label="Evan, technical co-founder"><div class="evan-picture"><img class="evan-art" src="${esc(src)}" alt="" width="1312" height="1199"></div><div class="evan-dialogue"><b>Evan <small>CTO</small></b><p>${wording(line, phone)}</p></div></aside>`;
}
