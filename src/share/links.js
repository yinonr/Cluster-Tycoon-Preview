// Links out of the game: the landing page, share targets and friend
// challenges ("same need sheet, your paddle").

import { BRAND } from '../config.js';
import { floorOn, today } from '../daily.js';

const join = (url, query) => (query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url);

// The landing page, tagged so invite requests from the game can be counted.
export const ctaUrl = () => (BRAND.cta.url && BRAND.cta.url !== '#' ? join(BRAND.cta.url, BRAND.share.ctaParams) : BRAND.cta.url);

// Challenges need the game's public address; until then shares point to the landing page.
export const canChallenge = () => Boolean(BRAND.share.gameUrl);
export const bareUrl = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

// Names arrive from URLs: drop control, zero-width and direction-override
// characters (keeping the joiners emoji and Persian need), then cut whole
// characters, not halves of an emoji.
const JUNK = /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
export const cleanName = (s, max = 24) => [...String(s ?? '').replace(JUNK, '').replace(/\s+/g, ' ').trim()].slice(0, max).join('').trim();

export function challengeUrl({ seed, iso, score, name, tries, rules }) {
  const p = new URLSearchParams({ s: String(seed) });
  if (iso) p.set('d', iso);
  p.set('vs', String(score));
  if (name) p.set('by', name);
  if (tries > 1) p.set('a', String(tries));
  p.set('v', String(rules));
  return join(BRAND.share.gameUrl, p.toString());
}

// A challenge from the page address. Only the seed, the score and the name
// are taken from it; the floor itself is always rebuilt from the seed.
// Anything malformed means no challenge.
export function readChallenge(query, rules) {
  try {
    const p = new URLSearchParams(query);
    const s = p.get('s');
    const vs = p.get('vs');
    if (!/^\d{1,10}$/.test(s || '') || !/^\d{1,5}$/.test(vs || '')) return null;
    const seed = Number(s);
    const score = Number(vs);
    if (seed > 0xFFFFFFFF || score > 10000) return null;
    const tries = Math.min(999, Math.max(1, Math.floor(Number(p.get('a')) || 1)));
    const sameRules = Number(p.get('v')) === rules;
    // Today's seed is today's floor even when the link didn't say so (a replay).
    const named = sameRules && p.get('d') ? floorOn(p.get('d'), rules) : null;
    const now = today(rules);
    const daily = named && named.seed === seed ? named : sameRules && seed === now.seed ? now : null;
    return {
      seed,
      score,
      name: cleanName(p.get('by')),
      tries,
      sameRules,
      daily,
    };
  } catch {
    return null;
  }
}

export const xIntent = (text, url) => `https://x.com/intent/post?${new URLSearchParams(url ? { text, url } : { text })}`;
export const linkedInShare = (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
