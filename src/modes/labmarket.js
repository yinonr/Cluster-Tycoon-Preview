// THE MARKET STORY (Deal Lab, V3 experiment). On the Daily, the first bulletin is
// always "a major AI lab absorbs" at 30–37 s and the board always goes up, so
// closing at noon always wins. In the lab that event is replaced by one seeded
// story a floor:
//   squeeze  a lab goes shopping: the board jumps (the Daily's absorb, at a lab time)
//   slide    racks land early: the board drops
//   calm     nothing moves until the afternoon's usual business
// Early on, the rostrum passes on word from the floor. It points the right way most
// of the time, not always. So "lock it in now, or wait?" is a read with a real
// chance of being wrong, and the afternoon is sometimes where the deal is.
//
// Drawn once per floor from stream(seed, 'lab', 'market'): no Daily draw moves.
// The rest of the day (the 1 PM call, the wind-down seller, the later bulletins)
// is the Daily's.

import { round2, stream, usd } from '../util.js';

export const MARKET = {
  stories: [{ w: 4, v: 'squeeze' }, { w: 3, v: 'slide' }, { w: 3, v: 'calm' }],
  at: [36, 62],            // floor seconds the move lands (12:45–1:20 PM)
  slide: [0.06, 0.11],     // how far the board drops on a slide ($/GPU-hr)
  rumorAt: [5, 9],         // floor seconds the word comes in
  honest: 0.75,            // the word points the right way this often
  winddown: 0.4,           // share of lab floors where a neocloud winds down after lunch (on the Daily it's every floor)
};

const WORD = {
  up: { headline: 'WORD ON THE FLOOR: A BIG LAB IS SHOPPING', sub: (g) => `Desks hear someone wants a lot of ${g}s after lunch. Maybe.` },
  down: { headline: 'WORD ON THE FLOOR: SHIPMENTS LANDING EARLY', sub: (g) => `Racks of ${g}s may hit the floor by one. Maybe.` },
  quiet: { headline: 'WORD ON THE FLOOR: QUIET SO FAR', sub: () => 'Nobody’s heard anything. Yet.' },
};

// The floor's story, drawn once and kept on the run.
export function storyOf(run) {
  if (run.labStory) return run.labStory;
  const r = stream(run.seed, 'lab', 'market');
  const id = r.weighted(MARKET.stories);
  const at = r.range(MARKET.at[0], MARKET.at[1]);
  const size = round2(r.range(MARKET.slide[0], MARKET.slide[1]));
  const rumorAt = r.range(MARKET.rumorAt[0], MARKET.rumorAt[1]);
  const honest = r.next() < MARKET.honest;
  const u = r.next();
  const truth = id === 'squeeze' ? 'up' : id === 'slide' ? 'down' : 'quiet';
  // A wrong word points the other way, or says nothing (on a calm day it points somewhere).
  const wrong = truth === 'quiet' ? (u < 0.5 ? 'up' : 'down') : u < 0.5 ? (truth === 'up' ? 'down' : 'up') : 'quiet';
  const winddown = r.next() < MARKET.winddown;
  run.labStory = { id, at, size, rumorAt, word: honest ? truth : wrong, honest, winddown };
  return run.labStory;
}

// Replace the Daily's always-up first event with the floor's story.
export function applyStory(run) {
  const m = run.market;
  const G = run.mandate.gpu;
  const s = storyOf(run);
  const absorb = m.schedule.find((ev) => ev.fire === run.events.labAbsorbs);
  if (absorb) m.schedule.splice(m.schedule.indexOf(absorb), 1);
  // The wind-down seller is a maybe, not a fixture: waiting for them is a gamble.
  const wind = m.schedule.find((ev) => ev.fire === run.events.distressed);
  if (wind && !s.winddown) m.schedule.splice(m.schedule.indexOf(wind), 1);
  const w = WORD[s.word];
  m.at(s.rumorAt, () => m.bulletin({ headline: w.headline, sub: w.sub(G), tone: s.word === 'up' ? 'up' : s.word === 'down' ? 'down' : 'flat', rumor: true }));
  if (s.id === 'squeeze') m.at(s.at, run.events.labAbsorbs);
  if (s.id === 'slide') {
    m.at(s.at, () => {
      const from = m.bench[G];
      m.shift(G, -s.size);
      m.shift('B200', -round2(s.size * 1.5));
      m.bulletin({ headline: 'CHIP SHIPMENT ARRIVES EARLY', sub: `Racks on the floor · ${G} ${usd(from)} → ${usd(m.bench[G])}`, tone: 'down' });
    });
  }
  return s;
}
