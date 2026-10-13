// VENTURE MODE: the save. A thin layer over the pure transitions in flow.js
// (and safe.acceptOffer): each call computes the next state, writes it at once
// and hands it back. Nothing else in src/venture touches storage.
//
// One key, 'hsc-venture-v1':
//   { v: 1, current: <venture state> | null, archive: { played, best, lastId } }
// It never reads or writes 'hsc-stats-v1' (the Daily Floor's stats).
//
// What can go wrong, and what happens:
//   - storage blocked, or a read throws    → memory only, notice 'memory'
//   - a write throws (quota, private mode) → memory only from then on, notice 'memory'
//   - unreadable or malformed data         → the raw text is copied to
//     'hsc-venture-v1-corrupt', a fresh save starts, notice 'corrupt'
//   - data from a newer version of the game → read-only: nothing is loaded and
//     nothing is written, so this (older) tab can't clobber it (a venture
//     started here plays in memory); notice 'newer'
//   - another tab moved the venture on     → the write is refused, this tab
//     adopts the stored venture, notice 'conflict' (and 'other-tab' as soon as
//     the browser's storage event says so)
//   - a venture saved under older rules    → it carries on, notice 'rules'
//
// Every step is safe to repeat: signing a deal twice books it once (by id),
// closing a quarter twice closes it once (only from phase 'close'), and a
// reload mid-floor ends that floor (recover: 'floor' → 'close', ended
// 'refresh') with the deals already written, each exactly once.
//
// Dev ventures (?venture=N, s.dev) live in memory and never touch the save.

import * as F from './flow.js';
import { acceptOffer } from './safe.js';
import { VENTURE_RULES, C } from './constants.js';

export const SAVE_KEY = 'hsc-venture-v1';
export const SAVE_VERSION = 1;
const PHASES = ['memo', 'briefed', 'floor', 'close', 'report', 'over'];

// Older save versions → the next one: MIGRATIONS[n](data) returns version n + 1.
// None yet. A version below SAVE_VERSION without a path here is treated as corrupt.
export const MIGRATIONS = {};

export const NOTICES = {
  memory: 'This browser isn\'t saving. Your company lasts until you close the tab.',
  corrupt: 'Your saved company couldn\'t be read, so a fresh desk is set up. The old save was kept aside.',
  newer: 'This save comes from a newer version of the game. Reload to update; nothing here will be saved.',
  conflict: 'Your company moved on in another tab. This tab now shows where it is.',
  'other-tab': 'Your company is open in another tab. Play it in one tab at a time.',
  rules: 'The game\'s rules changed since this company started. It carries on under the new ones.',
};

const blank = () => ({ v: SAVE_VERSION, current: null, archive: { played: 0, best: null, lastId: null, ids: [] } });
const KEEP_IDS = 40; // archived venture ids remembered, so no tab can archive one twice

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
function validVenture(c) {
  return !!c && typeof c === 'object' && typeof c.id === 'string' && isNum(c.seed) && isNum(c.rev)
    && isNum(c.q) && c.q >= 1 && c.q <= C.quarters && PHASES.includes(c.phase) && isNum(c.cash)
    && Array.isArray(c.book) && Array.isArray(c.history) && !!c.capTable && isNum(c.capTable.founderPct)
    && Array.isArray(c.capTable.holders) && !!c.model && !!c.market && !!c.events && Array.isArray(c.events.deck)
    && (c.phase === 'over' || (!!c.memo && Array.isArray(c.memo.options)))
    && (c.phase !== 'floor' || (!!c.floor && Array.isArray(c.floor.deals) && !!c.floor.mandate));
}
function validSave(d) {
  return !!d && typeof d === 'object' && d.v === SAVE_VERSION && !!d.archive && typeof d.archive === 'object'
    && isNum(d.archive.played) && (d.current === null || validVenture(d.current));
}

export function createVentureStore({ storage = globalThis.localStorage, key = SAVE_KEY, persist = true, now = () => Date.now(), onChange = null } = {}) {
  let data = blank();
  let mode = persist && storage ? 'storage' : 'memory'; // 'storage' | 'memory' | 'readonly'
  const notices = new Set();
  const changed = () => { if (onChange) onChange(api); };

  // ---- reading -------------------------------------------------------------
  // Returns { ok, data } from storage, or { ok: false, why } without changing anything.
  function readStored() {
    let raw;
    try { raw = storage.getItem(key); } catch { return { ok: false, why: 'memory' }; }
    if (raw == null) return { ok: true, data: blank(), raw };
    let d;
    try { d = JSON.parse(raw); } catch { return { ok: false, why: 'corrupt', raw }; }
    if (d && typeof d === 'object' && isNum(d.v) && d.v > SAVE_VERSION) return { ok: false, why: 'newer', raw };
    while (d && typeof d === 'object' && isNum(d.v) && d.v < SAVE_VERSION && MIGRATIONS[d.v]) {
      try { d = MIGRATIONS[d.v](d); } catch { return { ok: false, why: 'corrupt', raw }; }
    }
    if (!validSave(d)) return { ok: false, why: 'corrupt', raw };
    if (!d.archive.lastId) d.archive.lastId = null;
    if (!Array.isArray(d.archive.ids)) d.archive.ids = d.archive.lastId ? [d.archive.lastId] : [];
    return { ok: true, data: d, raw };
  }

  function load() {
    if (mode !== 'storage') return;
    const r = readStored();
    if (r.ok) {
      data = r.data;
      if (data.current && data.current.rules !== VENTURE_RULES) notices.add('rules');
      return;
    }
    if (r.why === 'memory') { mode = 'memory'; notices.add('memory'); return; }
    if (r.why === 'newer') { mode = 'readonly'; notices.add('newer'); return; }
    // Corrupt: keep the raw text aside, then start fresh. If even the backup
    // can't be written, don't overwrite the original: play in memory.
    notices.add('corrupt');
    try {
      storage.setItem(`${key}-corrupt`, r.raw);
      storage.setItem(key, JSON.stringify(data));
    } catch { mode = 'memory'; notices.add('memory'); }
  }

  // ---- writing -------------------------------------------------------------
  // Re-read, refuse if another tab moved the venture on, then write rev + 1.
  // Returns false when refused (this tab then shows the stored venture).
  function write(next, archiveFn = null) {
    const mine = data.current;
    if ((next && next.dev) || (!next && mine && mine.dev)) { data = { ...data, current: next }; changed(); return true; } // dev: memory only
    if (mode === 'storage') {
      const r = readStored();
      // A newer version of the game wrote the save meanwhile: never overwrite it.
      if (!r.ok && r.why === 'newer') { mode = 'readonly'; notices.add('newer'); }
      // Unreadable now (another tab, another build): keep a copy before writing over it.
      if (!r.ok && r.why === 'corrupt') {
        notices.add('corrupt');
        try { storage.setItem(`${key}-corrupt`, r.raw); } catch { mode = 'memory'; notices.add('memory'); }
      }
      if (r.ok) {
        const theirs = r.data.current;
        // Another tab moved on: a different venture, a later rev, or this
        // venture cleared or archived since this tab last wrote it.
        const moved = theirs && mine
          ? theirs.id !== mine.id || theirs.rev > mine.rev
          : theirs ? true : !!mine && (mine.rev > 0 || r.data.archive.ids.includes(mine.id));
        if (moved && !(next && mine === null)) { // starting a new venture always wins
          data = r.data;
          notices.add('conflict');
          changed();
          return false;
        }
        data = { ...r.data, current: data.current }; // keep the other tab's archive changes
      }
    }
    const out = { ...data, current: next ? { ...next, rev: (mine && next.id === mine.id ? mine.rev : (next.rev || 0)) + 1, updatedAt: now() } : null };
    if (archiveFn) out.archive = archiveFn(out.archive);
    data = out;
    if (mode === 'storage') {
      try { storage.setItem(key, JSON.stringify(out)); } catch { mode = 'memory'; notices.add('memory'); }
    }
    changed();
    return true;
  }

  // Apply a pure transition to the current venture and write it if anything changed.
  function step(fn) {
    const s = data.current;
    if (!s) return null;
    const next = fn(s);
    if (next === s) return s;
    write(next);
    return data.current;
  }

  // The exit goes into the archive in the same write as the last quarter.
  const archiveExit = (s) => (a) => {
    const ids = a.ids || [];
    if (s.dev || a.lastId === s.id || ids.includes(s.id)) return a;
    const ex = s.exit;
    const rec = { id: s.id, seed: s.seed, firm: s.player.firm, valuation: ex.valuation, stake: ex.stake, founderPct: ex.founderPct, tier: ex.tier, soldForParts: !!ex.soldForParts, at: now() };
    const best = !a.best || rec.stake > a.best.stake ? rec : a.best;
    return { ...a, played: a.played + 1, best, lastId: s.id, ids: [...ids, s.id].slice(-KEEP_IDS) };
  };

  load();

  const api = {
    get state() { return data.current; },
    get archive() { return data.archive; },
    get mode() { return mode; },
    get saving() { return mode === 'storage'; },
    get notices() { return [...notices].map((id) => ({ id, text: NOTICES[id] })); },
    dismiss(id) { notices.delete(id); },

    // A new venture replaces any current one (the coupon asks first).
    start({ seed, player, dev = false }) {
      // Its own id: the same seed played twice is two ventures (archive, rev guard).
      const t = now();
      const id = `v${seed}-${Number(t || 0).toString(36)}-${Math.floor(Math.random() * 46656).toString(36)}`;
      const s = F.startVenture({ seed, player, dev, now: t, id });
      if (dev) { data = { ...data, current: s }; changed(); return s; }
      const prev = data.current;
      data = { ...data, current: null };
      if (!write(s)) { data = { ...data, current: prev }; return data.current; }
      return data.current;
    },

    pickObjective: (type) => step((s) => F.pickObjective(s, type)),
    acceptSafe: (offerId) => step((s) => acceptOffer(s, offerId)),
    enterFloor: (run) => step((s) => F.enterFloor(s, run, now())),
    sign: (deal) => step((s) => F.signDeal(s, deal)),
    leaveFloor: (reason = 'office') => step((s) => F.leaveFloor(s, reason)),
    skipFloor: () => step((s) => F.skipFloor(s)),
    nextQuarter: () => step((s) => F.nextQuarter(s)),

    // The lever, then the quarter: the next state and its report in one write.
    // Only from 'close'; a second call returns null and changes nothing.
    closeQuarter(share) {
      const s = data.current;
      if (!s || s.phase !== 'close') return null;
      const { next, report } = F.closeQuarter(s, share);
      if (!report) return null;
      if (!write(next, next.phase === 'over' ? archiveExit(next) : null)) return null;
      return report;
    },

    // At boot: a floor left by a reload is over (its deals were written as they were signed).
    recover() {
      const s = data.current;
      if (!s || s.phase !== 'floor') return s;
      return step((x) => F.leaveFloor(x, 'refresh'));
    },

    // Re-read the save (after another tab's notice).
    reload() {
      if (mode !== 'storage') return data.current;
      const r = readStored();
      if (r.ok) { data = r.data; notices.delete('conflict'); notices.delete('other-tab'); changed(); }
      return data.current;
    },

    // Forget the current venture (the archive stays).
    clear() { write(null); },

    // The browser's storage event: another tab wrote this key.
    onStorage(e) {
      if (mode !== 'storage' || !e || e.key !== key) return;
      let d = null;
      try { d = JSON.parse(e.newValue); } catch { /* another tab's problem */ }
      const c = d && d.current;
      const mine = data.current;
      if ((c && (!mine || c.id !== mine.id || c.rev > mine.rev)) || (!c && mine)) { notices.add('other-tab'); changed(); }
    },
    listen(target = globalThis) {
      if (!target || !target.addEventListener) return () => {};
      const fn = (e) => api.onStorage(e);
      target.addEventListener('storage', fn);
      return () => target.removeEventListener('storage', fn);
    },
  };
  return api;
}
