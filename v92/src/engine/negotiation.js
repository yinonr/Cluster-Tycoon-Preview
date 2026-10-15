// Structured open-outcry negotiation. The seller has a hidden floor, a
// concession rate and a patience budget. No free-text dialogue: every
// exchange is a number plus one line from a short, readable phrasebook.

import { round2, usd, stream } from '../util.js';

const LINES = {
  open: ['{ask}. Clean block.', '{ask}. House confirmed.', 'Posted at {ask}.', '{ask}. Who wants it?'],
  counter: ['{ask}.', 'Best I can do: {ask}.', 'Meet me at {ask}.', '{ask}. And I’m being nice.', '{ask}. Final-ish.'],
  tough: ['Not there. {ask}.', 'You’re light. {ask}.', '{ask}. Don’t make me walk.'],
  floor: ['That’s my floor. {ask}.', '{ask}. Not a cent under.'],
  insult: ['That’s not a number.', 'Come on.', 'Did you read the board?', 'Funny. {ask}.'],
  repeat: ['You said that. {ask}.', 'Same number, same answer: {ask}.', 'Move or walk. {ask}.'],
  deal: ['DEAL.', 'Done.', 'You got it.', 'Sold. Sign it.'],
  walk: ['We’re done here.', 'Next.', 'Go call your broker.'],
  moveUp: ['Market just moved. New ask {ask}.', 'Board’s up. {ask} now.'],
  moveDown: ['Board came in. I can do {ask}.', 'Market softened. {ask}.'],
  termLong: ['{term} months? Now we’re talking. {ask}.', 'Longer commit, better rate: {ask}.'],
  termShort: ['Shorter term, higher rate. {ask}.', '{term} months costs you. {ask}.'],
  qty: ['{qty}? I can do that. {ask}.', '{qty} it is. {ask}.'],
  you: ['{p}.', 'I’ll do {p}.', '{p}, right now.', '{p}. Take it.'],
};

export class Negotiation {
  // rng: this haggle's own stream (how far the seller gives). voice: the
  // phrasebook's, so which line a seller says never moves a price.
  constructor({ market, lot, rng, voice, defaultTerm, defaultQty }) {
    this.m = market;
    this.lot = lot;
    this.rng = rng;
    this.voice = voice || stream(rng.seed, 'voice');
    this.term = defaultTerm;
    this.qty = defaultQty;
    this.conceded = 0;                 // how far the seller has come down from the posted ask
    this.patience = lot.patience;
    this.round = 0;
    this.status = 'open';              // open | agreed | walked | lost
    this.price = null;
    this.seenAsk = lot.ask;
    this.lastOffer = null;
    this.insults = 0;
    this.tape = [];
    this.say('seller', this.ask(), 'open');
  }

  line(kind, vars = {}) {
    const s = this.voice.pick(LINES[kind]);
    return s
      .replace('{ask}', usd(vars.ask ?? this.ask()))
      .replace('{p}', usd(vars.p ?? 0))
      .replace('{term}', vars.term ?? this.term)
      .replace('{qty}', (vars.qty ?? this.qty).toLocaleString('en-US'));
  }

  say(who, price, kind, vars) {
    const text = this.line(kind, { ...vars, ask: price, p: price });
    const entry = { who, price, text, kind };
    this.tape.push(entry);
    return entry;
  }

  floor(term = this.term) { return this.m.floorAt(this.lot, term); }
  posted(term = this.term) { return this.m.askAt(this.lot, term); }
  ask(term = this.term) { return round2(Math.max(this.floor(term), this.posted(term) - this.conceded)); }

  setTerm(term) {
    if (this.status !== 'open' || term === this.term) return null;
    const longer = term > this.term;
    this.term = term;
    return this.say('seller', this.ask(), longer ? 'termLong' : 'termShort', { term });
  }

  setQty(qty) {
    if (this.status !== 'open' || qty === this.qty) return null;
    this.qty = qty;
    return this.say('seller', this.ask(), 'qty', { qty });
  }

  agree(price) {
    this.status = 'agreed';
    this.price = round2(price);
    return this.say('seller', this.price, 'deal');
  }

  accept() {
    if (this.status !== 'open') return null;
    this.tape.push({ who: 'you', price: this.ask(), text: 'Done. I’ll take it.', kind: 'you' });
    return this.agree(this.ask());
  }

  counter(offer) {
    if (this.status !== 'open') return null;
    const p = round2(offer);
    const ask = this.ask();
    const floor = this.floor();
    this.round += 1;
    this.tape.push({ who: 'you', price: p, text: this.line('you', { p }), kind: 'you' });

    if (p >= ask) return this.agree(ask);
    const gap = round2(ask - p);
    const c = this.lot.concession * this.rng.range(0.8, 1.2);

    // Repeating (or lowering) your number doesn't wear a seller down; it wears them out.
    const stalled = this.lastOffer != null && p <= this.lastOffer;
    this.lastOffer = p;
    if (stalled) {
      this.patience -= 1;
      if (this.patience <= 0) { this.status = 'walked'; return this.say('seller', ask, 'walk'); }
      return this.say('seller', ask, 'repeat');
    }

    if (p >= floor) {
      // Inside the seller's range: close fast if near, otherwise split.
      if (gap <= 0.02) return this.agree(p);
      if (this.round >= 2 && p >= floor + (ask - floor) * 0.5 && this.rng.chance(0.3)) return this.agree(p);
      let next = round2(ask - Math.max(0.01, gap * c));
      if (next - p <= 0.01) return this.agree(p);
      this.conceded = round2(this.posted() - next);
      return this.say('seller', next, 'counter');
    }

    // Below the floor.
    // The first lowball is forgiven as an opener; after that it costs double.
    const insult = floor - p >= 0.15;
    if (insult) this.insults += 1;
    this.patience -= insult ? (this.insults > 1 ? 2 : 1) : 1;
    if (this.patience <= 0) {
      this.status = 'walked';
      return this.say('seller', ask, 'walk');
    }
    if (insult) {
      const next = round2(Math.max(floor, ask - 0.01));
      this.conceded = round2(this.posted() - next);
      return this.say('seller', next, 'insult');
    }
    const next = round2(Math.max(floor, ask - Math.max(0.01, (ask - floor) * c * 0.5)));
    this.conceded = round2(this.posted() - next);
    return this.say('seller', next, next <= floor ? 'floor' : 'tough');
  }

  // Called every frame by the sheet: reports market moves mid-haggle.
  checkMarket() {
    if (this.lot.ask === this.seenAsk) return null;
    const up = this.lot.ask > this.seenAsk;
    this.seenAsk = this.lot.ask;
    if (this.status !== 'open') return null; // a deal is a deal
    return this.say('seller', this.ask(), up ? 'moveUp' : 'moveDown');
  }

  lose() { this.status = 'lost'; }
}
