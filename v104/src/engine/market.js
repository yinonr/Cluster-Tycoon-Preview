// The market: benchmark rates, lots on the floor, rival fuses, the event
// schedule and the lot call. Persona-agnostic. Modes populate it and decide
// what the player may trade.
//
// The clock is event-exact: a frame only says how far to move it, and every
// drift tick, bulletin, fuse, cooling desk and hammer inside that frame
// happens at its own floor time, in order. So a seed plus the same player
// moves at the same floor times plays the same at 30 or 144 fps.

import { GPUS, TERM_ADJ } from '../data/gpus.js';
import { emitter, round2, stream } from '../util.js';

export const isLive = (lot) => lot.status === 'open' || lot.status === 'cooling';

const TICK = 1.6;      // the board drifts on fixed floor times: 1.6s, 3.2s, …
const WARN = 15;       // a fuse warns this long before the rival signs

export class Market {
  // rng: setup only (the opening prints). driftRng: the board's own stream.
  constructor({ rng, duration, driftRng }) {
    this.driftRng = driftRng || stream(rng.seed, 'drift');
    this.duration = duration;
    this.t = 0;
    this.closed = false;
    this.bench = {};   // displayed reference rate (drifts)
    this.level = {};   // where the drift mean-reverts to (moves on events)
    this.open = {};    // opening print, for ▲▼ on the board
    for (const g of Object.values(GPUS)) {
      const v = round2(g.base * (1 + rng.range(-0.012, 0.012)));
      this.bench[g.id] = v;
      this.level[g.id] = v;
      this.open[g.id] = v;
    }
    this.lots = [];
    this.characters = [];
    this.schedule = [];
    this.fills = [];
    this.bulletins = [];
    this.auction = null;
    this.bus = emitter();
    this.ticks = 0;
    this.halted = false;
    this.seq = 1;
  }

  on(evt, fn) { return this.bus.on(evt, fn); }
  emit(evt, data) { this.bus.emit(evt, data); }
  id(prefix) { return `${prefix}${this.seq++}`; }
  timeLeft() { return Math.max(0, this.duration - this.t); }

  addCharacter(c) { this.characters.push(c); this.emit('character:added', c); return c; }
  character(id) { return this.characters.find((c) => c.id === id); }

  addLot(lot) {
    lot.status = 'open';
    lot.fuse = lot.fuse || null;
    lot.lastMove = null;
    this.lots.push(lot);
    this.emit('lot:added', lot);
    return lot;
  }
  lot(id) { return this.lots.find((l) => l.id === id); }
  liveLots() { return this.lots.filter(isLive); }

  // Quotes are posted at the lot's base term; other terms price off TERM_ADJ.
  askAt(lot, term) { return round2(lot.ask + TERM_ADJ[term] - TERM_ADJ[lot.baseTerm]); }
  floorAt(lot, term) { return round2(lot.floor + TERM_ADJ[term] - TERM_ADJ[lot.baseTerm]); }

  // Move a product's market level; every live desk quoting it reprices.
  shift(gpu, delta) {
    delta = round2(delta);
    const from = this.bench[gpu];
    this.level[gpu] = round2(this.level[gpu] + delta);
    this.bench[gpu] = round2(this.bench[gpu] + delta);
    const moved = [];
    for (const lot of this.lots) {
      if (lot.gpu !== gpu || !isLive(lot)) continue;
      const before = lot.ask;
      lot.ask = round2(lot.ask + delta);
      lot.floor = round2(lot.floor + delta);
      lot.lastMove = { from: before, to: lot.ask, at: this.t };
      moved.push(lot);
    }
    this.emit('reprice', { gpu, from, to: this.bench[gpu], delta, lots: moved });
    return { from, to: this.bench[gpu] };
  }

  setFuse(lot, seconds, rival) {
    lot.fuse = { endsAt: this.t + seconds, total: seconds, rival, warned: false, done: false };
    this.emit('fuse:set', lot);
  }

  sellToRival(lot, rival) {
    lot.status = 'gone';
    lot.goneReason = 'rival';
    this.recordFill({ gpu: lot.gpu, qty: lot.qty, site: lot.site.code, term: lot.baseTerm, rate: lot.ask, by: 'rival' });
    this.emit('lot:gone', { lot, rival });
  }

  removeLot(lot, reason = 'left') {
    lot.status = 'gone';
    lot.goneReason = reason;
    this.emit('lot:gone', { lot, reason });
  }

  // The player took some or all of a lot.
  take(lot, qty) {
    lot.qty -= qty;
    if (lot.qty <= 0 || lot.qty < (lot.minQty || 1)) {
      lot.status = 'closed';
      lot.fuse = null;
    }
    this.emit('lot:status', lot);
  }

  cool(lot, seconds) {
    lot.status = 'cooling';
    lot.coolUntil = this.t + seconds;
    this.emit('lot:status', lot);
  }

  recordFill(fill) {
    fill.t = this.t;
    this.fills.push(fill);
    this.emit('fill', fill);
  }

  bulletin(b) {
    b.t = this.t;
    this.bulletins.push(b);
    this.emit('bulletin', b);
  }

  // Frame entry point: moves the floor clock dt seconds on.
  update(dt) { this.runTo(this.t + dt); }

  // Runs the floor up to floor time `end`, stopping at each thing due on the
  // way so it happens at its own time (see the note at the top).
  runTo(end) {
    if (this.closed || this.halted) return;
    end = Math.min(end, this.duration);
    for (let n = 0, at = this.nextDue(); at <= end && !this.halted && n < 1000; n++, at = this.nextDue()) this.step(at);
    if (this.halted) return;
    this.step(end);
    if (this.t >= this.duration) {
      this.closed = true;
      this.emit('close');
    }
  }

  // The next floor time something is due. step() consumes everything due at
  // or before its time with the same comparisons, so the loop always moves on.
  nextDue() {
    let at = (this.ticks + 1) * TICK;
    if (this.schedule.length) at = Math.min(at, this.schedule[0].at);
    for (const lot of this.lots) {
      if (lot.status === 'cooling') at = Math.min(at, lot.coolUntil);
      const f = lot.fuse;
      if (f && !f.done && isLive(lot)) at = Math.min(at, f.warned ? f.endsAt : f.endsAt - WARN);
    }
    if (this.auction) at = Math.min(at, this.auction.nextAt());
    return at;
  }

  step(t) {
    this.t = Math.max(this.t, t);

    while ((this.ticks + 1) * TICK <= this.t) { this.ticks += 1; this.drift(); }

    while (this.schedule.length && this.schedule[0].at <= this.t) {
      const ev = this.schedule.shift();
      ev.fire(this);
    }

    for (const lot of this.lots) {
      if (lot.status === 'cooling' && this.t >= lot.coolUntil) {
        lot.status = 'open';
        this.emit('lot:status', lot);
      }
      const f = lot.fuse;
      if (f && !f.done && isLive(lot)) {
        if (!f.warned && this.t >= f.endsAt - WARN) { f.warned = true; this.emit('fuse:warn', lot); }
        if (this.t >= f.endsAt) { f.done = true; this.sellToRival(lot, f.rival); }
      }
    }

    if (this.auction) this.auction.advance(this.t);
  }

  // The player's floor is over (need sheet filled): nothing else moves, so the
  // tape reads the market as it stood at the fill.
  halt() { this.halted = true; }

  drift() {
    for (const id of Object.keys(this.bench)) {
      const pull = (this.level[id] - this.bench[id]) * 0.35;
      this.bench[id] = round2(this.bench[id] + pull + this.driftRng.range(-1, 1) * GPUS[id].vol);
    }
    this.emit('tick');
  }

  // Schedule helper: keeps the queue sorted.
  at(seconds, fire) {
    this.schedule.push({ at: seconds, fire });
    this.schedule.sort((a, b) => a.at - b.at);
  }
}
