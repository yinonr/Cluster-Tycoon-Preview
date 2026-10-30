import { resultHorizon, resultLabel } from './results.js';
// A self-contained, client-side final receipt. All text comes from the finalized game state.
import { MODEL_NAMES, focusOf } from '../tycoon/founder.js';
import { short, pctOf } from './pit-ledger.js';
export const challengeUrl = (seed, href = location.href, rounds = 5) => {
  const u = new URL('./', href);
  u.search = `?seed=${Number(seed) >>> 0}`;
  u.searchParams.set('challenge', '1');
  u.searchParams.set('rounds', String(rounds));
  u.hash = '';
  return u.toString();
};
export const scorecardModel = g => {
  const x = g.arcade.exit;
  if (g.phase !== 'over' || !x) throw Error('A finalized game is required');
  return { name: g.company.name?.trim() || 'My AI Startup', wealth: x.payout, ownership: x.founderPct,
    title: x.title, kind: x.kind, mark: !!x.mark, realized: x.realized ?? (x.mark ? 0 : x.payout),
    retained: x.retained ?? (x.mark ? x.payout : 0), focus: focusOf(g.company),
    model: MODEL_NAMES[g.company.level], seed: g.seed, rounds: g.arcade.history.length, horizon: resultHorizon(g), label: resultLabel(g) };
};
// HSC design pass: the scorecard follows HSC's live social post (Figma 643:2): Paper ground with a light print grain,
// a Display-size number, an ink LED ticker band in Doto, and the original ink lockup bottom right. The text is the
// card's existing content; fonts and the lockup are self-hosted and preloaded (scorecardReady).
const INK = '#161514', PAPER = '#F8F7F5', GREY = '#6E685E', LED = '#9BE507', LED_WARN = '#E55C07';
const SERIF = 'Gelasio, Georgia, serif', SANS = '"News Cycle", "Arial Narrow", Arial, sans-serif', DOTS = 'Doto, VT323, monospace';
const LOCKUP = typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: new URL('../../brand/logo/hsc-lockup-ink.svg', import.meta.url).href });
export const scorecardReady = typeof document === 'undefined' ? Promise.resolve() : Promise.all([
  LOCKUP.decode().catch(() => {}),
  ...['400 180px Gelasio', 'italic 400 46px Gelasio', '700 26px "News Cycle"', '400 26px "News Cycle"', '900 36px Doto'].map(f => document.fonts?.load(f).catch(() => {})),
]).then(() => true);
const ellipsize = (c, text, max) => { let t = text; while (t.length > 1 && c.measureText(t).width > max) t = t.slice(0, -2) + '…'; return t; };
const fitSize = (c, text, max, start, min, font) => { let size = start; for (; size > min; size--) { c.font = font(size); if (c.measureText(text).width <= max) break; } return size; };
// A light print grain, seeded by the game so the same run always yields the same PNG.
function grain(c, seed) {
  let a = (Number(seed) >>> 0) || 1;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  c.fillStyle = 'rgba(22,21,20,.07)';
  for (let i = 0; i < 9000; i++) c.fillRect(Math.floor(rnd() * 1200), Math.floor(rnd() * 630), 1, 1);
}
const up = (c, x, y, s, color) => { c.fillStyle = color; c.beginPath(); c.moveTo(x, y); c.lineTo(x + s, y); c.lineTo(x + s / 2, y - s * .86); c.closePath(); c.fill(); };
const down = (c, x, y, s, color) => { c.fillStyle = color; c.beginPath(); c.moveTo(x, y - s * .86); c.lineTo(x + s, y - s * .86); c.lineTo(x + s / 2, y); c.closePath(); c.fill(); };
export function scorecardCanvas(g) {
  const m = scorecardModel(g), canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const c = canvas.getContext('2d'); if (!c) throw Error('Canvas unavailable');
  const L = 56, R = 1144, W = R - L, shut = m.kind === 'shutdown';
  c.fillStyle = PAPER; c.fillRect(0, 0, 1200, 630);
  grain(c, m.seed);
  c.textBaseline = 'alphabetic';
  // Header rail: what this is, and which market.
  c.fillStyle = INK; c.font = `700 26px ${SANS}`; c.textAlign = 'left'; c.fillText('Founder wealth', L, 82);
  c.textAlign = 'right'; c.fillText('Cluster Tycoon', R, 82);
  c.fillStyle = GREY; c.font = `400 22px ${SANS}`; c.fillText(`Seed ${m.seed} · ${m.label}`, R, 112);
  c.textAlign = 'left';
  // The hero: founder wealth, a Display number in lining figures.
  const amount = m.wealth >= 1e8 ? short(m.wealth) : '$' + (m.wealth / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if ('letterSpacing' in c) c.letterSpacing = '-6px';
  const hero = fitSize(c, amount, W - 260, 196, 72, s => `400 ${s}px ${SERIF}`);
  c.font = `400 ${hero}px ${SERIF}`; c.fillStyle = INK;
  if ('fontVariantNumeric' in c) c.fontVariantNumeric = 'lining-nums';
  c.fillText(amount, L - 4, 254);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  // The company and how it ended.
  c.font = `italic 400 46px ${SERIF}`; c.fillText(ellipsize(c, m.name, W), L, 314);
  c.font = `400 28px ${SANS}`; c.fillStyle = shut ? INK : GREY; c.fillText(ellipsize(c, m.title || m.kind, W), L, 354);
  // The LED ticker band, as on HSC's social posts: the challenge line, up for a fortune, down for a shutdown.
  c.fillStyle = INK; c.fillRect(0, 380, 1200, 76);
  const led = shut ? LED_WARN : LED, arrow = shut ? down : up;
  arrow(c, L, 434, 26, led);
  c.font = `900 36px ${DOTS}`; c.fillStyle = led; c.fillText('Can you build a bigger fortune?', L + 44, 432);
  // The details, in the deck's small-label voice.
  c.fillStyle = INK; c.font = `700 26px ${SANS}`; c.fillText(`Ownership ${pctOf(m.ownership)}`, L, 506);
  c.font = `400 24px ${SANS}`; c.fillText(ellipsize(c, `${m.focus} · Model ${m.model}`, 820), L, 542);
  c.fillStyle = GREY; c.font = `400 22px ${SANS}`;
  c.fillText(m.retained > 0 ? `Paper equity ${short(m.retained)} · Cash proceeds ${short(m.realized)}` : `Cash proceeds ${short(m.realized)}`, L, 576);
  // The original HSC lockup (ink, on paper), bottom right with clear space.
  if (LOCKUP?.complete && LOCKUP.naturalWidth) c.drawImage(LOCKUP, R - 236, 630 - 56 - 83, 236, 83);
  return canvas;
}
export const scorecardDataUrl = g => scorecardCanvas(g).toDataURL('image/png');
export function scorecardFile(g) {
  const data = atob(scorecardDataUrl(g).split(',')[1]), bytes = new Uint8Array(data.length);
  for (let i=0;i<data.length;i++) bytes[i]=data.charCodeAt(i);
  return new File([bytes],`cluster-tycoon-${resultHorizon(g)}-round-campaign-seed-${g.seed}.png`,{type:'image/png'});
}
export const scoreMillions = cents => `$${(cents/100000000).toLocaleString('en-US',{maximumFractionDigits:cents<100000000?8:2})}M`;
export function shareCopy(g, href) {
  const m=scorecardModel(g),url=challengeUrl(m.seed, href, m.horizon),score=scoreMillions(m.wealth);
  return {url,caption:`My ${m.label}: ${score} on Cluster Tycoon, a GPU live trading game. ${url}`};
}
