// The lot call. SOURCE: Notion Act II, "At one the lots are called... the board
// over the rostrum shows what is being sold, the clock and the current highest
// bid." An ascending open auction with a hammer that resets on every paddle.

import { round2, emitter } from '../util.js';

const PHASES = [
  { at: 0, id: 'open', label: 'Do I hear more?' },
  { at: 3.6, id: 'once', label: 'Going once…' },
  { at: 6.2, id: 'twice', label: 'Going twice…' },
  { at: 8.6, id: 'sold', label: 'SOLD.' },
];

export class Auction {
  // rng: the rostrum's own stream. t: the floor time the lot is called. The
  // rival's paddle and the hammer fall at set floor times (see advance), so a
  // lot call plays the same at any frame rate.
  constructor({ lot, rng, rivalMax, rivalPaddle, playerPaddle, t = 0 }) {
    this.lot = lot;
    this.rng = rng;
    this.high = lot.opening;
    this.leader = null;          // null | 'you' | 'rival'
    this.rivalMax = rivalMax;
    this.rivalPaddle = rivalPaddle;
    this.playerPaddle = playerPaddle;
    this.clock = t;
    this.quietFrom = t + 2.5;    // grace period while the lot is read out
    this.rivalAt = t + rng.range(2.6, 3.6);
    this.phase = 'open';
    this.state = 'calling';      // calling | sold
    this.winner = null;
    this.bids = [];
    this.bus = emitter();
  }

  on(evt, fn) { return this.bus.on(evt, fn); }

  get price() { return this.leader ? this.high : this.lot.opening; }
  // Seconds since the last paddle (negative during the read-out).
  get idle() { return this.clock - this.quietFrom; }
  nextBid(inc = 0.01) { return round2((this.leader ? this.high : this.lot.opening - 0.01) + inc); }

  bid(who, amount) {
    if (this.state !== 'calling') return false;
    this.high = round2(amount);
    this.leader = who;
    this.quietFrom = this.clock;
    this.bids.push({ who, amount: this.high, t: this.clock });
    this.setPhase('open');
    this.bus.emit('bid', { who, amount: this.high });
    return true;
  }

  playerBid(inc = 0.01) {
    if (this.leader === 'you') return false;
    return this.bid('you', this.nextBid(inc));
  }

  setPhase(id) {
    if (this.phase === id) return;
    this.phase = id;
    this.bus.emit('phase', PHASES.find((p) => p.id === id));
  }

  // When the rostrum next moves: the rival's paddle or the next hammer call.
  nextAt() {
    if (this.state !== 'calling') return Infinity;
    const i = PHASES.findIndex((p) => p.id === this.phase);
    return Math.min(this.rivalAt, this.quietFrom + PHASES[i + 1].at);
  }

  // Runs the rostrum up to floor time t, each paddle and hammer call at its own
  // moment (the rival goes first on a tie, as it always has).
  advance(t) {
    for (let at = this.nextAt(); at <= t; at = this.nextAt()) {
      this.clock = Math.max(this.clock, at);
      if (this.rivalAt <= at) this.rivalTurn();
      else this.hammer();
    }
    this.clock = Math.max(this.clock, t);
  }

  // The rival paddle answers until it hits its limit.
  rivalTurn() {
    this.rivalAt += this.rng.range(1.3, 2.9);
    if (this.leader === 'rival') return;
    const inc = this.rng.pick([0.01, 0.01, 0.02, 0.03]);
    const amt = this.nextBid(inc);
    if (amt <= this.rivalMax) this.bid('rival', amt);
  }

  hammer() {
    const next = PHASES[PHASES.findIndex((p) => p.id === this.phase) + 1];
    this.setPhase(next.id);
    if (next.id === 'sold') {
      this.state = 'sold';
      this.winner = this.leader || 'pass';
      this.soldAt = this.clock;
      this.bus.emit('sold', { winner: this.winner, price: this.high });
    }
  }
}
