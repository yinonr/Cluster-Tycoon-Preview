// VENTURE MODE: the quarter's phases as pure transitions. Each takes a state
// and returns the next one (the same object when the step doesn't apply, so a
// repeated click or a replayed write changes nothing). save.js persists each
// result; the screens call these through it.
//
//   memo ─pickObjective─▶ briefed ─enterFloor─▶ floor ─leaveFloor─▶ close ─closeQuarter(share)─▶ report
//    ▲                                           signDeal ↺                                       │
//    └──────────────────────────────── nextQuarter ◀──────────────────────────────────────────────┘
//   after Q6, or SOLD FOR PARTS: over (s.exit)
//
// acceptOffer (safe.js) works in memo, briefed and floor. skipFloor goes
// straight to close: the objective is missed.

import { newVenture, clone } from './state.js';
import { boardMemo, optionOf, evaluate, boardOrder, sheetOf } from './objectives.js';
import { safeThisQuarter } from './safe.js';
import { resolveQuarter } from './economy.js';

export function startVenture({ seed, player, dev = false, now = null, id = null }) {
  const s = newVenture({ seed, player, dev, now, id });
  s.memo = boardMemo(s);
  return s;
}

// The objective is committed when picked: refreshing can't re-pick it.
export function pickObjective(s, type) {
  if (s.phase !== 'memo' || !optionOf(s.memo, type)) return s;
  const n = clone(s);
  n.memo.chosen = type;
  n.phase = 'briefed';
  return n;
}

// run: the quarter's floor (floor.js buildRun). Its need sheet is kept, so
// deals can be judged after a reload.
export function enterFloor(s, run, now = null) {
  if (s.phase !== 'briefed') return s;
  const n = clone(s);
  n.phase = 'floor';
  n.floor = { q: s.q, seed: run.seed, objective: s.memo.chosen, mandate: clone(run.mandate), deals: [], startedAt: now, ended: null, result: null };
  return n;
}

// A deal at signing (after mode.recordDeal gave it its id), by id: twice is once.
export function signDeal(s, deal) {
  if (s.phase !== 'floor' || !s.floor || !deal.id) return s;
  const n = clone(s);
  const d = clone(deal);
  const i = n.floor.deals.findIndex((x) => x.id === d.id);
  if (i >= 0) n.floor.deals[i] = d; else n.floor.deals.push(d);
  return n;
}

// BACK TO THE OFFICE, the 5 PM bell, or a reload mid-floor (reason 'refresh').
export function leaveFloor(s, reason = 'office') {
  if (s.phase !== 'floor') return s;
  const n = clone(s);
  n.phase = 'close';
  n.floor.ended = reason;
  n.floor.result = evaluate(n.floor.mandate, boardOrder(safeThisQuarter(n), n.floor.deals));
  return n;
}

// No floor this quarter. A picked objective keeps its need sheet, so SAFE
// compute taken in the office can still meet it; with none picked, it's missed.
export function skipFloor(s) {
  if (s.phase !== 'memo' && s.phase !== 'briefed') return s;
  const n = clone(s);
  n.phase = 'close';
  const obj = s.phase === 'briefed' ? optionOf(s.memo, s.memo.chosen) : null;
  n.floor = obj ? { q: s.q, seed: null, objective: obj.type, mandate: sheetOf(obj, s), deals: [], startedAt: null, ended: 'skipped', result: null } : null;
  if (n.floor) n.floor.result = evaluate(n.floor.mandate, boardOrder(safeThisQuarter(n), []));
  return n;
}

// The lever, then the quarter resolves: { next, report }.
export function closeQuarter(s, share) {
  if (s.phase !== 'close') return { next: s, report: null };
  return resolveQuarter(s, { share });
}

export function nextQuarter(s) {
  if (s.phase !== 'report') return s;
  const n = clone(s);
  n.phase = 'memo';
  n.cashQ = n.cash;
  n.floor = null;
  n.memo = boardMemo(n);
  return n;
}
