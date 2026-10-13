// VENTURE MODE: the event deck. Eight cards and two quiet ones, shuffled once
// per venture (stream(vs, 'deck')). One is drawn at each close from Q1 to Q5,
// printed on the quarter report and the next board memo, and in force from
// the next quarter. The memo's WORD ON THE FLOOR names the card coming at this
// quarter's close, right C.rumorAcc of the time (objectives.js).
//
// A card changes the company's world, never a floor that is already open:
// market moves land on s.market (the next floor's bench), floor effects wait
// in s.pending until floor.js builds the next floor.

import { C, GPU_IDS } from './constants.js';
import { stream, round2 } from '../util.js';

const scale = (s, k, kB200 = k) => {
  for (const g of GPU_IDS) s.market[g] = round2(s.market[g] * (g === 'B200' ? kB200 : k));
};

export const EVENTS = {
  GLUT: {
    head: 'BLACKWELL SHIPMENTS ARRIVE EARLY',
    line: `Compute gets cheaper: the bench drops ${Math.round(C.ev.glut * 100)}%, and a second wind-down seller will be on the next floor.`,
    word: 'Container ships are early at the port.',
    apply(s) { scale(s, 1 - C.ev.glut, 1 - C.ev.glutB200); s.pending.glut = true; },
  },
  CRUNCH: {
    head: 'MAJOR LAB ABSORBS THE SUPPLY',
    line: `Compute gets dearer: the bench rises ${Math.round(C.ev.crunch * 100)}%. Next floor, most blocks are half the size and rivals move faster; their customers look for capacity.`,
    word: 'A big lab is calling every desk in town.',
    apply(s) { scale(s, 1 + C.ev.crunch, 1 + C.ev.crunchB200); s.pending.crunch = true; },
  },
  EFFICIENT: {
    head: 'OPEN MODEL HALVES INFERENCE COST',
    line: `Your customers need less compute: demand falls ${Math.round(C.ev.efficient * 100)}%.`,
    word: 'An open-weights release is due any day.',
    apply(s) { s.demand *= 1 - C.ev.efficient; },
  },
  DEMAND: {
    head: 'AGENTS GO MAINSTREAM',
    line: `Demand jumps ${Math.round(C.ev.demand * 100)}%. Serve them all with capacity to spare and you win the customers rivals can't take.`,
    word: 'Every enterprise wants an agent by spring.',
    apply(s) { s.demand *= 1 + C.ev.demand; s.pending.demand = true; },
  },
  CREDIT: {
    head: 'THE FED HIKES; CREDIT TIGHTENS',
    line: `Every financed contract pays ${round2(C.ev.creditSpread).toFixed(2)} more per GPU-hour, and the capital line shrinks to ${Math.round(C.ev.creditLine * 100)}%.`,
    word: 'Rates are going up. Lenders are nervous.',
    apply(s) { s.spread = round2(s.spread + C.ev.creditSpread); s.lineMul *= C.ev.creditLine; },
  },
  RIVAL: {
    head: 'RIVAL LAB SHIPS A BETTER MODEL',
    line: `Your price drops ${Math.round(C.ev.rival * 100)}% until your next model launch; demand dips ${Math.round(C.ev.rivalDemand * 100)}%.`,
    word: 'A rival lab is about to ship.',
    apply(s) { s.priceMult = 1 - C.ev.rival; s.demand *= 1 - C.ev.rivalDemand; },
  },
  ENTERPRISE: {
    head: 'ENTERPRISE BUDGETS OPEN',
    line: `Next memo carries a pilot customer paying ${C.ev.enterprise}× the usual bonus.`,
    word: 'Enterprise budgets unlock next quarter.',
    apply(s) { s.pending.enterprise = true; },
  },
  POWER: {
    head: 'POWER CONSTRAINT ON THE GRID',
    line: `Next floor, the prime, mid and broker blocks (and any fresh capacity) deliver ${C.ev.powerDelay} days later.`,
    word: 'The grid is maxed out in three states.',
    apply(s) { s.pending.power = true; },
  },
  QUIET1: { head: 'A QUIET QUARTER', line: 'Nothing moves the market.', word: 'Quiet out there.', apply() {} },
  QUIET2: { head: 'A QUIET QUARTER', line: 'Nothing moves the market.', word: 'Quiet out there.', apply() {} },
};

export const DECK = Object.keys(EVENTS);

// The venture's deck, in draw order.
export const deck = (seed) => stream(seed, 'deck').shuffle(DECK);

// The card drawn at this quarter's close (what the rumor is about).
export const nextCard = (s) => (s.q < C.quarters ? s.events.deck[s.q - 1] : null);

// Draw the card at the close of s.q and apply it to s (a working copy).
export function drawEvent(s) {
  const id = nextCard(s);
  if (!id) return null;
  EVENTS[id].apply(s);
  s.events.i = s.q;
  s.events.next = id;
  return id;
}
