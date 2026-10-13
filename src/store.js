// What this browser remembers between visits: the daily floors played, the
// streak, personal bests and how often each floor was played. It lives on this
// device only, and storage can be blocked (private windows, embedded previews),
// so every read and write falls back to memory and nothing here throws.

import { isoDay, dayIso } from './daily.js';

const KEY = 'hsc-stats-v1';
const KEEP_DAYS = 60;
const KEEP_SEEDS = 80;

const blank = () => ({
  v: 1,
  seenOffice: false,
  daily: {},                                  // iso date -> { seed, t, state: 'started' | 'done', score, rating }
  streak: { count: 0, last: null, best: 0 },  // consecutive San Francisco days with an official floor
  best: { daily: null, practice: null },      // { score, rating, seed }
  plays: {},                                  // 's' + seed -> finished runs on this device (string keys keep insertion order)
});

let memory = blank();
let writeFailed = false; // once a write fails, the stored copy is stale: trust memory

function load() {
  if (writeFailed) return memory;
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1 && s.daily && s.streak && s.best && s.plays) memory = s;
  } catch { /* blocked or corrupt: keep the in-memory copy */ }
  return memory;
}

function save(s) {
  const days = Object.keys(s.daily).sort();
  for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete s.daily[d];
  const seeds = Object.keys(s.plays);
  for (const k of seeds.slice(0, Math.max(0, seeds.length - KEEP_SEEDS))) delete s.plays[k];
  memory = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { writeFailed = true; }
}

export const store = {
  seenOffice: () => load().seenOffice,
  markSeenOffice() { const s = load(); if (!s.seenOffice) { s.seenOffice = true; save(s); } },

  daily: (iso) => load().daily[iso] || null,

  // The official run is locked when the doors open, not when it ends, so
  // walking out and reloading doesn't buy a second try. It still counts for
  // the streak.
  startDaily(floor) {
    const s = load();
    if (s.daily[floor.iso]) return false;
    s.daily[floor.iso] = { seed: floor.seed, t: floor.t, state: 'started' };
    const st = s.streak;
    if (st.last == null || floor.day > st.last) {
      st.count = st.last === floor.day - 1 ? st.count + 1 : 1;
      st.last = floor.day;
    } else {
      // An older day locked late (a tab left open over midnight): count back
      // from the latest day again, so it fills the gap instead of resetting.
      let n = 0;
      while (s.daily[dayIso(st.last - n)]) n++;
      const oldest = Math.min(...Object.keys(s.daily).map(isoDay));
      st.count = st.last - n < oldest ? Math.max(n, st.count) : n;
    }
    st.best = Math.max(st.best, st.count);
    save(s);
    return true;
  },

  // First result wins (re-read first, in case another tab got there).
  finishDaily(floor, result) {
    const s = load();
    const e = s.daily[floor.iso];
    if (!e || e.state !== 'started' || e.seed !== floor.seed) return false;
    s.daily[floor.iso] = { ...e, state: 'done', score: result.score, rating: result.rating };
    save(s);
    return true;
  },

  // Days in a row, as of the given San Francisco day.
  streak(day) {
    const st = load().streak;
    return st.last != null && st.last >= day - 1 ? st.count : 0;
  },

  // Returns the previous best (null if none) and keeps the higher score.
  recordBest(kind, result) {
    const s = load();
    const prev = s.best[kind] || null;
    if (!prev || result.score > prev.score) {
      s.best[kind] = { score: result.score, rating: result.rating, seed: result.seed };
      save(s);
    }
    return prev;
  },

  best: (kind) => load().best[kind] || null,

  plays: (seed) => load().plays[`s${seed}`] || 0,
  countPlay(seed) {
    const s = load();
    const k = `s${seed}`;
    const n = (s.plays[k] || 0) + 1;
    delete s.plays[k]; // re-insert so the most recent seeds are the ones kept
    s.plays[k] = n;
    save(s);
    return n;
  },
};
