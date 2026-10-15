// SELLER WANTS (Deal Lab, V3 experiment). Every seller on a lab floor values
// something, and it isn't always price:
//   certainty  LONG TENANT: wants commitment. Their longest term (longer than you
//              need) moves them at once; without it they barely move. Your first
//              counter on a shorter term brings their offer: two real ways to
//              close (your term at their ask, or their longest at their tenant
//              price), either one signable from the lot sheet.
//   quick      ON THE CLOCK: has a board call. A good fast price is on the table;
//              you get two or three counters, then "Last call", then they're gone.
//   respect    PROUD: a straight opening number earns their respect and part of
//              the give; a lowball insults them and they stop negotiating.
//   hungry     HUNGRY: needs cash today. Only a bold opening lowball unlocks their
//              room; a polite opener and they hold the line.
//   none       PLAIN: the Daily's haggle, price only.
//   desperate  the wind-down seller: hungry, with more to give.
// The same opening move (straight or lowball) is right with one seller and ruinous
// with another, so the read comes first. You read them from what they shout across
// the floor (some keep their want to themselves), their opening line on the lot
// sheet, how they react, and their mood. Every signal is true: a seller may hold
// something back, but never fakes a want they don't have. Giving a long tenant
// what they want costs you something real (months you won't use), shown on the lot
// sheet before you commit; the others cost risk, not money.
//
// Nothing here draws from a game stream: each lot's want, give and lines come from
// stream(seed, 'want', lot.id); the haggle's own stream is untouched (the lab only
// moves the seller's floor, their pace and the lines). The Daily never uses this module.

import { round2, stream, usd } from '../util.js';

// ---- Tuning ---------------------------------------------------------------------
export const WANT = {
  // Room a met want unlocks under the seller's floor ($/GPU-hr).
  give: { certainty: [0.06, 0.14], volume: [0.06, 0.12], quick: [0.05, 0.10], respect: [0.05, 0.09], hungry: [0.06, 0.12], desperate: [0.06, 0.12] },
  // volume is off: it only fits the 2× long block, where the spare GPUs always cost more than the give.
  weights: { certainty: 3, volume: 0, quick: 2, respect: 2.5, hungry: 2, none: 1.5 },
  shownShare: 0.5,           // share of the give a met long-tenant or hungry want hands over at once (the rest is room to haggle)
  quickShare: 1.0,           // an on-the-clock seller's fast price is the whole give
  quickCounters: [2, 3],     // counters an on-the-clock seller takes before "Last call" comes (the next one walks them)
  quickClose: 0.04,          // a counter this close to an on-the-clock seller's ask closes on the spot
  lowball: 0.07,             // an opening this far under the ask: insults the proud, wins over the hungry
  hungryFree: 3,             // a won-over hungry seller forgives this many counters under their floor
  unmetRoom: 0.04,           // a long tenant without their term gives this much off the posted price, no more
  insultFloor: 0.08,         // an insulted proud seller's floor goes this far above their base floor
  resumePatience: 2,         // a seller you walked out on takes you back with this much patience, and no give
  strand: 0.24,              // $/GPU-hr lost on contract months past your use (sublet at a loss)
  excess: 0.12,              // $/GPU-hr lost on GPUs past your need (sublet at a loss)
  use: [{ w: 2, v: 6 }, { w: 5, v: 12 }, { w: 3, v: 24 }], // how long the need sheet's GPUs will be used, months
  tellShare: 0.7,            // share of sellers whose floor shouts carry their want (the lot sheet's opening always does)
};

const LINES = {
  open: {
    certainty: ['{ask}. I like tenants who stay.', '{ask}. Racks don’t pay for themselves.', 'I’m selling next year, not next week. {ask}.'],
    volume: ['{ask}. Half-empty racks are killing me.', 'Too much of this on my books. {ask}.', '{ask}. I want this block gone.'],
    quick: ['Got a board call. {ask} if we do it now.', '{ask} if we’re done fast. I’ve got a call.', 'Clock’s ticking. {ask}, right now.'],
    respect: ['{ask}. Bring me a real number.', 'Twenty years doing this. {ask}.', '{ask}. Don’t waste my time.'],
    hungry: ['{ask}. Make me an offer. Any offer.', 'Everything moves today. {ask}.', '{ask}. I’ve got racks to empty.'],
  },
  met: {
    certainty: ['{term} months? Now you’re speaking my language. {ask}.', 'A tenant who stays. {ask}.'],
    volume: ['The whole block? You just made my week. {ask}.', 'All of it? Then {ask}.'],
  },
  unmet: { certainty: 'Shorter? Then {ask}.', volume: 'Less of it? Then {ask}.' },
  shrug: { term: 'Term doesn’t move me. {ask}.', qty: 'Size doesn’t move me. {ask}.' },
  straight: ['Straight number. I respect that. {ask}.', 'Now you’re talking. {ask}.'],
  bold: ['Bold. I like bold. {ask}.', 'Cash today? Then {ask}.'],
  serious: 'You’re serious. Done at {p}.',
  insult: 'That’s insulting. {ask}.',
  shame: 'Shame it’s only {term} months. {ask}.',
  offer: 'Not for {term} months. {ask} for {term}, or {p} if you stay {long}.',
  waste: 'Don’t waste my clock. {ask}.',
  tough: ['Not there. {ask}.', 'You’re light. {ask}.'],
  edge: 'Don’t make me walk. {ask}.',
  lastCall: ['Last call. {ask}.', 'Last call. Take it or I’m gone. {ask}.'],
  gone: ['That’s my call. I’m gone.', 'Board’s calling. I’m out.'],
  quickDone: ['Done. I’ve got a call.', 'Done. Sign it, I’m late.'],
  dither: 'Make up your mind. {ask}.',
  again: ['You again. {ask}.', 'Back already? {ask}.'],
};

// Floor tells: a want's lines join the desk's shouts.
export const SHOUTS = {
  certainty: ['LONG MONEY GETS MY BEST NUMBER.', 'I’M SELLING NEXT YEAR, NOT NEXT WEEK.'],
  volume: ['TOO MUCH CAPACITY. TAKE IT ALL.', 'WHOLE BLOCK? LET’S TALK.'],
  quick: ['GOT A BOARD CALL. LET’S GO.', 'FIRST CLEAN YES GETS IT.'],
  respect: ['NO TOURISTS. REAL NUMBERS ONLY.', 'TWENTY YEARS ON THIS FLOOR.'],
  hungry: ['EVERYTHING MOVES TODAY.', 'MAKE ME AN OFFER. ANY OFFER.'],
};

// What the House says about a seller's want (the lab's one tip a floor).
export const TIP = {
  certainty: 'wants a tenant for the long haul. Their longest term moves them; without it they barely budge.',
  volume: 'needs that whole block gone.',
  quick: 'has a board call. Their fast price is real. Don’t haggle past “last call.”',
  respect: 'hates lowballs. Open with a straight number and they’ll meet you.',
  hungry: 'needs cash today. Open low and bold, or they’ll hold the line.',
  none: 'is a plain haggler. Price is all they care about.',
  desperate: 'is in wind-down. Open low and bold.',
};

export const WANT_LABEL = { certainty: 'Long tenant', volume: 'Clear the racks', quick: 'On the clock', respect: 'Proud', hungry: 'Hungry', none: 'Plain', desperate: 'Desperate' };
const hungryLike = (id) => id === 'hungry' || id === 'desperate';

const fill = (s, v) => s.replace('{ask}', usd(v.ask ?? 0)).replace('{term}', v.term ?? '').replace('{p}', usd(v.p ?? 0));

// ---- A lot's want ----------------------------------------------------------------
// Deterministic per lot (seed + lot id), whatever happened on the floor before.
export function wantOf(run, lot) {
  if (lot.labWant) return lot.labWant;
  const r = stream(run.seed, 'want', lot.id);
  const uType = r.next(), uGive = r.next(), uK = r.next(), uLine = r.next(), uTell = r.next();
  let id = 'none';
  if (lot.archetype === 'distressed') id = 'desperate';
  else if (lot.archetype !== 'called') {
    // A want has to take a deliberate move to meet: a longer term than the one that
    // matches your use, or more GPUs than you need.
    const ok = {
      certainty: Math.max(...lot.terms) > defaultTermFor(run, lot),
      volume: !!lot.divisible && lot.qty > run.mandate.qty,
      quick: true, respect: true, hungry: true, none: true,
    };
    const pool = Object.entries(WANT.weights).filter(([k, wt]) => ok[k] && wt > 0);
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let x = uType * total;
    for (const [k, w] of pool) { if ((x -= w) <= 0) { id = k; break; } }
  }
  if (run.tySupplierWant && lot.archetype !== 'called') id = run.tySupplierWant(lot);
  const g = WANT.give[id];
  const want = {
    id,
    give: g ? round2(g[0] + (g[1] - g[0]) * uGive) : 0,
    counters: uK < 0.5 ? WANT.quickCounters[0] : WANT.quickCounters[1],
    lineU: uLine,
    tells: uTell < WANT.tellShare,
  };
  lot.labWant = want;
  return want;
}

// The lab's default term on a lot: the one that matches your use, or the nearest above it.
export function defaultTermFor(run, lot) {
  const use = useMonths(run);
  const ok = lot.terms.filter((t) => t >= run.mandate.minTerm).sort((a, b) => a - b);
  return ok.find((t) => t >= use) ?? ok[ok.length - 1] ?? Math.max(...lot.terms);
}

// How long the need sheet's GPUs will be used (months), drawn once per seed.
export function useMonths(run) {
  if (run.labUse == null) run.labUse = stream(run.seed, 'lab', 'use').weighted(WANT.use);
  return run.labUse;
}

// The real cost of a deal: the effective rate (fee included) plus what you lose on
// months past your use and GPUs past your need. counted = GPUs that go to the need.
export function realCost(run, { qty, term, eff }, counted) {
  const use = useMonths(run);
  // The trading economy (economy.js): idle months are sublet at its rate, counted per hour
  // you deliver; spare GPUs are inventory (sold or sublet in the ledger), not a price.
  if (run.econ) {
    const strand = term > use ? round2(run.econ.sublet * (term - use) / use) : 0;
    return { real: round2(eff + strand), strand, excess: 0, stranded: Math.max(0, term - use), extra: Math.max(0, qty - counted) };
  }
  const strand = term > use ? round2(WANT.strand * (term - use) / term) : 0;
  const extra = Math.max(0, qty - counted);
  const excess = extra > 0 ? round2(WANT.excess * extra / Math.max(1, counted)) : 0;
  return { real: round2(eff + strand + excess), strand, excess, stranded: Math.max(0, term - use), extra };
}

// Would perfect play get this want's give with this term and quantity? (for par)
export function satisfiable(want, lot, term, qty) {
  if (want.id === 'certainty') return term === Math.max(...lot.terms);
  if (want.id === 'volume') return qty >= lot.qty;
  return want.id === 'quick' || want.id === 'respect' || hungryLike(want.id);
}

// ---- The haggle, with a want ------------------------------------------------------
// Wraps a fresh Negotiation in place. The underlying haggle keeps its stream and
// logic; the lab moves the seller's floor while their want is met, hands over part of
// the give at once, changes how fast they concede, and adds the lines that let you read them.
export function wantHaggle(neg, run, lot) {
  const m = run.market;
  const w = wantOf(run, lot);
  const st = { want: w.id, give: w.give, counters: 0, bonus: 0, insulted: false, straight: 0, won: false, lost: false, lastCall: false, freeLeft: WANT.hungryFree, spoiled: false, offered: false, offer: null, quotes: null };
  neg.labState = st;
  const longest = Math.max(...lot.terms);
  const baseFloor = neg.floor.bind(neg);
  const met = (term = neg.term, qty = neg.qty) => {
    if (st.spoiled) return false;
    if (w.id === 'certainty') return term === Math.max(...lot.terms);
    if (w.id === 'volume') return qty >= lot.qty;
    if (w.id === 'quick') return true;
    if (w.id === 'respect') return !st.insulted;
    if (hungryLike(w.id)) return st.won;
    return false;
  };
  // Their floor: the give comes off while the want is met; a long tenant without their
  // term barely moves off the posted price.
  neg.floor = (term = neg.term) => {
    if (met(term)) return round2(baseFloor(term) - w.give);
    if (w.id === 'respect' && st.insulted) return round2(baseFloor(term) + WANT.insultFloor);
    if (w.id === 'certainty' || w.id === 'volume') return round2(Math.max(baseFloor(term), m.askAt(lot, term) - WANT.unmetRoom));
    return baseFloor(term);
  };
  neg.wantMet = () => met();

  // A long tenant's offer (made once a haggle): their longest term at the price they'd say
  // if you switched now (the shown share of the give off), next to your term at their ask.
  // Both are live: a market move or a counter re-prices them. st.quotes keeps the last pair
  // for the stamp's note.
  const longQuote = () => round2(Math.max(neg.floor(longest), m.askAt(lot, longest) - (neg.conceded - st.bonus + round2(w.give * WANT.shownShare))));
  neg.offerTerms = () => {
    if (!st.offer || st.spoiled || neg.status !== 'open' || met()) return null;
    const terms = [{ term: neg.term, rate: neg.ask() }, { term: longest, rate: longQuote() }];
    st.quotes = { [neg.term]: terms[0].rate, [longest]: terms[1].rate };
    return terms;
  };
  // Take one of the offer's packages as quoted: switch to it (free: they asked for it) and accept.
  neg.takeOffer = (term) => {
    const pick = (neg.offerTerms() || []).find((o) => o.term === term);
    if (!pick) return null;
    const e = term !== neg.term ? neg.setTerm(term) : null;
    if (neg.status === 'open' && Math.abs(neg.ask() - pick.rate) < 1e-9) return neg.accept();
    return e; // never sign a price the card didn't show: the seller says the new one instead
  };

  const pick = (arr) => arr[Math.floor(w.lineU * arr.length)];
  const say = (text, p) => { const e = { who: 'seller', price: neg.ask(), text: fill(text, { ask: neg.ask(), term: neg.term, p }), kind: 'want' }; neg.tape.push(e); return e; };
  const setBonus = (on, share = WANT.shownShare) => {
    const target = on ? round2(w.give * share) : 0;
    neg.conceded = round2(neg.conceded + target - st.bonus);
    st.bonus = target;
  };

  // The opening: an on-the-clock seller's fast price is on the table at once; the
  // others tell you (most of the time) in their own voice.
  if (w.id === 'quick') setBonus(true, WANT.quickShare);
  const voice = w.id === 'desperate' ? null : LINES.open[w.id];
  if (voice) { // the lot sheet's opening line always tells the truth (the floor's shouts may not)
    neg.tape[0].price = neg.ask();
    neg.tape[0].text = fill(pick(voice), { ask: neg.ask() });
  } else if (neg.tape[0]) neg.tape[0].price = neg.ask();

  // Changing term or size: a met want moves the seller at once; one that isn't gets a
  // shrug. Free until your first counter; after that it costs patience.
  const dither = () => {
    if (neg.round > 0 && neg.status === 'open') {
      neg.patience -= 1;
      if (neg.patience <= 0) { neg.status = 'walked'; return neg.say('seller', neg.ask(), 'walk'); }
      return say(LINES.dither);
    }
    return null;
  };
  const wrapChange = (fn, kind) => (...args) => {
    const was = met();
    // Moving to the term a long tenant offered costs no patience (they asked for it), once.
    const free = kind === 'term' && !!st.offer && args[0] === st.offer.term;
    const e = fn(...args);
    if (!e) return e;
    if (free) st.offer = null;
    const now = met();
    if ((w.id === 'certainty' && kind === 'term') || (w.id === 'volume' && kind === 'qty')) {
      if (now !== was) { setBonus(now); neg.tape.pop(); return (free ? null : dither()) || say(now ? pick(LINES.met[w.id]) : LINES.unmet[w.id]); }
    } else if ((kind === 'term' && args[0] === Math.max(...lot.terms)) || (kind === 'qty' && args[0] >= lot.qty)) {
      neg.tape.pop();
      return dither() || say(LINES.shrug[kind]);
    }
    return dither() || e;
  };
  neg.setTerm = wrapChange(neg.setTerm.bind(neg), 'term');
  neg.setQty = wrapChange(neg.setQty.bind(neg), 'qty');

  const counter = neg.counter.bind(neg);
  neg.counter = (offer) => {
    if (neg.status !== 'open') return null;
    const ask = neg.ask();
    const p = round2(offer);
    const opening = neg.round === 0;
    const bold = ask - p >= WANT.lowball - 1e-9;
    const youSaid = () => { neg.round += 1; neg.lastOffer = p; neg.tape.push({ who: 'you', price: p, text: `${usd(p)}.`, kind: 'you' }); };

    // On the clock: a counter after "Last call" walks them; a decisive number closes on the spot.
    if (w.id === 'quick' && !st.spoiled) {
      if (st.lastCall) { youSaid(); neg.status = 'walked'; return say(pick(LINES.gone)); }
      if (p < ask && ask - p <= WANT.quickClose + 1e-9) { youSaid(); const e = neg.agree(p); e.text = pick(LINES.quickDone); return e; }
    }
    // Hungry: the opening number decides it. Bold wins them over; polite loses the room for good.
    if (hungryLike(w.id) && opening && !st.spoiled) { if (bold) st.won = true; else st.lost = true; }

    // On the clock: a bold number wastes their time (it counts twice).
    if (w.id === 'quick' && !st.spoiled && bold) st.counters += 1;
    const patience0 = neg.patience;
    const e = counter(offer);

    // A won-over hungry seller drops hard in their reply (the size of the drop is the tell),
    // and forgives your first few counters under their floor.
    if (hungryLike(w.id) && st.won && neg.status !== 'walked') {
      if (neg.patience < patience0 && st.freeLeft > 0) { st.freeLeft -= 1; neg.patience = patience0; }
      // The drop lands in their reply: they say the price they're really at.
      if (opening && neg.status === 'open') { setBonus(true, 0.5); neg.tape.pop(); return say(pick(LINES.bold)); }
    }
    // Proud: each of your first two straight counters takes half the give off (and can close
    // at your number); a lowball insults them: back to posted, a higher floor, the give gone.
    if (w.id === 'respect' && !st.insulted && !st.spoiled && neg.status === 'open') {
      if (bold) {
        setBonus(false);
        st.insulted = true;
        neg.conceded = 0;
        neg.patience -= 1;
        if (neg.patience <= 0) { neg.status = 'walked'; return neg.say('seller', neg.ask(), 'walk'); }
        neg.tape.pop();
        return say(LINES.insult);
      }
      if (st.straight < 2 && p > (st.lastStraight ?? 0)) {
        st.straight += 1;
        st.lastStraight = p;
        setBonus(true, Math.min(1, 0.5 * st.straight));
        neg.tape.pop();
        if (neg.ask() <= p + 1e-9) { const d = neg.agree(p); d.text = fill(LINES.serious, { p }); return d; }
        return say(pick(LINES.straight));
      }
    }
    // A long tenant without their term says why they won't move. The first time, they make
    // their offer: your term at their ask, or their longest at their tenant price.
    if (w.id === 'certainty' && !met() && !st.spoiled && neg.status === 'open') {
      neg.tape.pop();
      if (st.offered) return say(LINES.shame);
      st.offered = true;
      st.offer = { term: longest };
      const e = say(LINES.offer.replace('{long}', longest).replaceAll('{term}', neg.term), longQuote());
      e.kind = 'offer';
      return e;
    }
    // On the clock: count the counters; the last one before they walk brings "Last call".
    if (w.id === 'quick' && !st.spoiled && neg.status === 'open') {
      st.counters += 1;
      if (st.counters >= w.counters - 1) { st.lastCall = true; neg.tape.pop(); return say(pick(LINES.lastCall)); }
      if (bold) { neg.tape.pop(); return say(LINES.waste); }
    }
    // "Don't make me walk" means it: only at their last point of patience.
    if (neg.status === 'open' && e && e.kind === 'tough') {
      neg.tape.pop();
      return say(neg.patience <= 1 ? LINES.edge : pick(LINES.tough));
    }
    return e;
  };

  // Walking out isn't a reset: come back after they cool off and they remember you.
  neg.resume = () => {
    if (neg.status !== 'walked') return null;
    neg.status = 'open';
    neg.patience = WANT.resumePatience;
    st.spoiled = true;
    st.lastCall = false;
    st.insulted = st.insulted || w.id === 'respect';
    st.bonus = 0;
    st.offer = null;
    neg.conceded = 0;
    return say(pick(LINES.again));
  };
  return neg;
}

// The seller's mood, for the lot sheet. Coarse on purpose: you learn they're near the
// edge, not how many risky counters you have left.
export function moodOf(run, lot, neg) {
  const st = neg.labState;
  if (!st || neg.status !== 'open') return null;
  const w = wantOf(run, lot);
  if (w.id === 'quick' && !st.spoiled) return st.lastCall ? { text: 'LAST CALL', cls: 'bad' } : { text: 'ON THE CLOCK', cls: 'hot' };
  if (neg.patience <= 1) return { text: 'MOOD · ABOUT TO WALK', cls: 'bad' };
  if (st.insulted) return { text: 'MOOD · INSULTED', cls: 'bad' };
  if (((w.id === 'certainty' || w.id === 'volume') && neg.wantMet()) || st.straight || st.won) return { text: 'MOOD · PLEASED', cls: 'ok' };
  if (neg.patience === 2) return { text: 'MOOD · IMPATIENT', cls: 'warn' };
  if (neg.patience >= lot.patience) return { text: 'MOOD · RELAXED', cls: 'ok' };
  return { text: 'MOOD · LISTENING', cls: '' };
}
