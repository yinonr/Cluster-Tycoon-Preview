// What a share says: the post text, the LinkedIn caption, the card and the
// head-to-head line, all from one set of facts about the run. Finance units
// first (GPUs, $/GPU-hr, the board clock), the rating second, the score third.

import { BRAND, FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR } from '../config.js';
import { int, usd, wallClock } from '../util.js';
import { bareUrl } from './links.js';

const cents = (avg, target) => {
  const d = Math.round((avg - target) * 100);
  return d < 0 ? `${-d}¢ under target` : d > 0 ? `${d}¢ over target` : 'on target';
};

// A challenger who left the name blank gets a paddle of their own (yours is 7).
export const rivalName = (ch) => ch.name || 'Paddle 11';

// Right-to-left names are isolated so the digits around them stay in order.
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;
const isolate = (s) => (RTL.test(s) ? `\u2068${s}\u2069` : s);

export function tapeFacts(run, r, score) {
  const md = run.mandate;
  const daily = run.kind === 'daily' ? run.daily : null;
  const trades = r.deals.length;
  return {
    label: daily ? daily.label : 'Practice',
    floorLabel: `THE FLOOR · ${daily ? daily.label : 'PRACTICE'}`,
    subLabel: daily ? daily.line : null,
    buyer: run.playerName || '',
    firm: md.company,
    secured: r.secured,
    qty: `${int(r.secured)}/${int(md.qty)} ${r.gpuLabel}`,
    hero: `${int(r.secured)} / ${int(md.qty)} ${r.gpuLabel}`,
    rate: r.avg != null ? `${usd(r.avg)}/GPU-hr` : null,
    vsTarget: r.avg != null ? cents(r.avg, md.target) : null,
    filledAt: r.filled && r.closeT != null ? wallClock(r.closeT, run.market.duration, FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR).label : null,
    short: Math.max(0, md.qty - r.secured),
    gpu: md.gpu,
    need: md.qty,
    trades,
    rating: r.rating,
    filled: r.filled,
    score: trades ? score.total : null,
    deskNote: run.deskNote || null,
  };
}

// "Sam: 8,420. Me: 8,960." for a rematch, or null.
export function versus(run, score) {
  const ch = run.challenge;
  if (!ch || !ch.sameRules) return null;
  const me = score.total;
  const them = ch.score;
  const name = isolate(rivalName(ch));
  return {
    name, me, them,
    won: me > them,
    tie: me === them,
    result: me > them ? `You beat ${name} by ${int(me - them)}. ${name} can’t talk now.`
      : me === them ? `Dead heat at ${int(me)}. Settle it on the real floor: ${BRAND.eventDate}.`
        : `${name}: ${int(them)}. You: ${int(me)}. Jim’s on line one.`,
    card: me > them ? `Beat ${name}’s ${int(them)} by ${int(me - them)}.`
      : me === them ? `Dead heat with ${name} at ${int(me)}.`
        : `${name} ${int(them)} · Me ${int(me)}`,
    post: `${name}: ${int(them)}. Me: ${int(me)}.`,
  };
}

function lines(f) {
  if (!f.trades) return [`0/${int(f.need)} ${f.gpu}. The bell didn’t wait.`, 'NO FILL'];
  if (!f.filled) {
    return [`${f.qty} at ${f.rate}`, `${int(f.short)} short at the bell.`, `${f.rating} · ${int(f.score)}`];
  }
  return [
    `${f.qty} at ${f.rate}, ${f.vsTarget}`,
    `Filled by ${f.filledAt}. ${f.trades} trade${f.trades === 1 ? '' : 's'}. ${f.deskNote || '0 NDAs.'}`,
    `${f.rating} · ${int(f.score)}`,
  ];
}

// challenge: the link rebuilds this need sheet for a friend (needs the game's
// public address and at least one trade); otherwise it points at the real floor.
const linkLine = (url, challenge) => (challenge ? `Same need sheet, your paddle: ${url}` : `The real floor: ${BRAND.eventDate}, ${BRAND.city}. ${bareUrl(url)}`);

function post(f, vs) {
  const end = vs ? vs.post : f.filled ? '' : 'Jim’s on line one.';
  return [`The Floor · ${f.label} · ${BRAND.name}`, ...lines(f), ...(end ? ['', end] : [])];
}

// The post with the link inline, for the share sheet and copying.
export const postText = (f, vs, url, challenge) => [...post(f, vs), linkLine(url, challenge)].join('\n');

// X weighs most CJK and emoji as 2 and any link as 23, out of 280.
const LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
const weight = (s) => [...s].reduce((n, ch) => {
  const c = ch.codePointAt(0);
  return n + (LIGHT.some(([a, b]) => c >= a && c <= b) ? 1 : 2);
}, 0);

// X takes the link separately (it adds a space and 23 for it). Long posts drop
// the closing line, then the desk note, to stay under the limit.
export function xText(f, vs, challenge) {
  const fits = (t) => weight(t) + 24 <= 280;
  const tail = challenge ? 'Same need sheet, your paddle:' : `The real floor: ${BRAND.eventDate}, ${BRAND.city}.`;
  let t = [...post(f, vs), tail].join('\n');
  if (!fits(t)) t = post(f, vs).join('\n');
  if (!fits(t)) t = post({ ...f, deskNote: null }, vs).join('\n');
  return t;
}

// LinkedIn takes only a link, so the caption is copied for the player to paste.
export function linkedInCaption(f, vs, url, challenge) {
  const what = !f.trades ? `Tried to buy ${int(f.need)} ${f.gpu}s on a 1980s trading floor. The bell didn’t wait.`
    : !f.filled ? `Bought ${int(f.secured)} of ${int(f.need)} ${f.gpu}s on a 1980s trading floor before the bell. Rated ${f.rating}.`
      : `Bought ${int(f.need)} ${f.gpu}s on a 1980s trading floor by ${f.filledAt}: ${f.rate}, ${f.vsTarget}, zero NDAs. Rated ${f.rating}.`;
  return [
    what + (vs ? ` ${vs.post}` : ''),
    '',
    `It’s The Floor, a game from ${BRAND.name}. The real floor is ${BRAND.eventDate} in ${BRAND.city}.`,
    '',
    challenge ? `Same need sheet, your paddle: ${url}` : bareUrl(url),
  ].join('\n');
}

// The data the card renderer (share/card.js) draws.
export function cardData(f, vs, url) {
  return {
    floorLabel: f.floorLabel,
    subLabel: f.subLabel,
    buyer: f.buyer,
    firm: f.firm,
    hero: f.hero,
    rateLine: f.rate ? `${f.rate}${f.filled ? ` · ${f.vsTarget}` : ''}` : null,
    timeLine: !f.trades ? 'The bell didn’t wait.'
      : !f.filled ? `${int(f.short)} short at the bell`
        : `Filled ${f.filledAt} · ${f.trades} trade${f.trades === 1 ? '' : 's'} · 0 NDAs`,
    deskNote: f.deskNote,
    rating: f.rating,
    ratingTone: !f.trades ? 'stamp' : f.filled ? 'spot' : 'ink',
    score: f.score,
    newBest: Boolean(f.newBest),
    slip: {
      from: 'Jim · your broker',
      msg: '“Found a guy who knows a guy. Can get you capacity in Q2 next year.”',
      reply: f.filled ? '' : 'Jim’s on line one.',
    },
    vs: vs ? { line: vs.card } : null,
    wordmark: BRAND.wordmark,
    footer: `Fictional market. The real floor: ${BRAND.eventDate}, ${BRAND.city}.`,
    url: bareUrl(url),
  };
}
