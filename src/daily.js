// THE DAILY FLOOR: everyone plays the same need sheet each day, named by the
// countdown to the real floor ("T-38" = 38 days to the bell). Days roll over at
// midnight in San Francisco, wherever the player is.

import { BRAND } from './config.js';
import { hash32 } from './util.js';

const PT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric' });

// Whole days since 1970-01-01 for an ISO date, and back.
export const isoDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
};
export const dayIso = (day) => new Date(day * 864e5).toISOString().slice(0, 10);

// Today's day number on the San Francisco calendar.
export function ptDay(date = new Date()) {
  const p = Object.fromEntries(PT.formatToParts(date).map((x) => [x.type, x.value]));
  return Math.round(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 864e5);
}

const bellDay = () => isoDay(BRAND.share.eventDay);

// "T-38" before the event, "T-0" on the day, "T+3" after.
export const tLabel = (t) => (t >= 0 ? `T-${t}` : `T+${-t}`);

export function bellLine(t) {
  if (t > 1) return `${t} days to the bell`;
  if (t === 1) return '1 day to the bell';
  if (t === 0) return 'The real floor opens today';
  return `The real floor rang on ${BRAND.eventDate}`;
}

// The floor for a given day. rulesVersion is part of the seed, so a balance
// change can't silently turn a floor people already played into another game.
export function dailyFloor(day, rulesVersion = 1) {
  const iso = dayIso(day);
  const t = bellDay() - day;
  return { day, iso, t, label: tLabel(t), line: bellLine(t), seed: hash32(BRAND.share.dailySalt, rulesVersion, iso) };
}

export const today = (rulesVersion) => dailyFloor(ptDay(), rulesVersion);

// The daily floor an ISO date names, if it is a real day no later than today.
export function floorOn(iso, rulesVersion) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const day = isoDay(iso);
  if (!Number.isFinite(day) || dayIso(day) !== iso || day > ptDay()) return null;
  return dailyFloor(day, rulesVersion);
}
