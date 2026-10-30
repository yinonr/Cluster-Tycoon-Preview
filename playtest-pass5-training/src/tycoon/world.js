// V10.6 The Living World: a small data-driven layer over the founder game. Characters remember
// what you did, the market reacts, customers turn up, and every twist is gated on the company's
// real state. Content is data (world-content.js; docs/v106/SCHEMA.md is its contract), every
// draw comes from a named seeded stream, and every effect moves money through the existing
// ledger: nothing here mints cash or GPUs without a buyer, a seller or a cost.
import { ECONOMY } from './economy-balance.js';
import { stream } from '../util.js';
import { GPUS, MODEL_NAMES, FOUNDER, revenueNow, burnOf, enterpriseValue, founderPct, pendingIntegration, recipeCost, isMixed, liveProducts } from './founder.js';
import { ASK, DRIFT } from './founder-market.js';
import { supplierStyle } from './exchange.js';
import { SELLER_FIRMS } from '../data/names.js';
import { EVENTS, EPILOGUES as WORLD_EPILOGUES } from './world-content.js';
import { SCENARIO_EPILOGUES } from './scenario-content.js';
// V10.14 adds the scenario endings (acquired, defaulted anchors, the inference company…) to the
// generated world epilogues; the generated content file itself is unchanged.
const EPILOGUES = [...WORLD_EPILOGUES, ...SCENARIO_EPILOGUES];

// Pacing: about three or four memorable twists a game, a few smaller developments, at most one
// memo on a board update and three in a game. Majors and minors are rolled separately.
export const WORLD = Object.freeze({ majors: 3, majorCap: 4, major: .45, minor: .35, flavor: .25, memos: 3, rivals: 2, sheets: 6, sentiment: [-.25, .25] });

export function createWorld() {
  return { flags: {}, seen: {}, inv: {}, due: [], spawns: [], sentiment: [], exitMods: [], memo: null, news: [], log: [], twists: 0, memos: 0, rivals: 0, seq: 0 };
}

// ---- Facts: the only state content may test (SCHEMA §3) --------------------------------------
export function facts(g) {
  const a = g.arcade, c = g.company, w = g.world || createWorld(), last = a.history.at(-1), cash = Math.round(g.cash * 100);
  const revenue = revenueNow(c), burn = burnOf(c), net = revenue - burn, ev = enterpriseValue(c);
  const lanes = { product: 0, research: 0, infra: 0, opportunity: 0 };
  for (const b of c.builds) if (lanes[b.lane] !== undefined) lanes[b.lane]++;
  const top = Object.entries(lanes).filter(([k]) => k !== 'opportunity').sort((x, y) => y[1] - x[1])[0];
  const lastBuilds = last ? c.builds.filter(b => b.q === last.q) : [];
  const run = lastBuilds.find(b => b.lane === 'research');
  const trusts = Object.values(g.firms).map(f => f.trust || 0);
  const puzzles = a.history.filter(h => h.puzzle);
  const invStates = Object.values(w.inv).map(x => x.state);
  return {
    round: g.q, cash, revenue, burn, net, runway: net >= 0 ? 99 : Math.floor(cash / -net), valuation: cash + ev, ev,
    level: c.level, breakthroughs: c.breakthroughs, products: liveProducts(c).length, racks: c.racks.length,
    rackGpus: c.racks.reduce((n, k) => n + Math.floor(k.qty * k.online), 0),
    builtProduct: lanes.product, builtResearch: lanes.research, builtInfra: lanes.infra, builtOpportunity: lanes.opportunity,
    focus: top && top[1] ? top[0] : 'none', founderPct: founderPct(c), raised: c.raised, signed: c.shares.investors.length,
    lastBuilt: lastBuilds.length, lastMixed: lastBuilds.filter(b => b.mixed).length,
    lastRun: run ? (run.result || 'pending') : 'none', lastLevelUp: !!last && last.level > last.levelBefore,
    lastExpired: last?.expiredQty || 0, lastNet: last ? last.revenue - last.paidBurn : 0,
    lastPuzzle: puzzles.length ? puzzles.at(-1).puzzle.efficiency : -1, perfectRacks: c.builds.filter(b => b.tuned).length,
    delayed: pendingIntegration(g).some(b => b.status === 'delayed'),
    market: a.event?.kind || 'quiet', marketGpu: a.event?.gpu || null,
    maxTrust: trusts.length ? Math.max(...trusts) : 0, minTrust: trusts.length ? Math.min(...trusts) : 0, burnedFirms: trusts.filter(t => t <= -1).length,
    declined: invStates.filter(s => s === 'declined').length, walked: invStates.filter(s => s === 'walked').length,
  };
}
function value(g, F, key) {
  if (key in F) return F[key];
  const [kind, id] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
  if (kind === 'inv') return g.world.inv[id]?.state || 'unmet';
  if (kind === 'flag') return g.world.flags[id] ?? false;
  if (kind === 'seen') return g.world.seen[id] || 0;
  return undefined;
}
// A condition list; a single [fact, op, value] (the appetite format in SCHEMA.md) also reads as a list.
export const condList = c => !c ? [] : typeof c[0] === 'string' ? [c] : c;
export function holds(g, F, conds = []) {
  return condList(conds).every(([key, op, v]) => {
    const x = value(g, F, key);
    switch (op) {
      case '==': return x === v; case '!=': return x !== v;
      case '<': return x < v; case '<=': return x <= v; case '>': return x > v; case '>=': return x >= v;
      case 'in': return Array.isArray(v) && v.includes(x);
      default: return false;
    }
  });
}

// ---- Event selection ------------------------------------------------------------------------
const inRounds = (e, q) => !e.rounds || (q >= e.rounds[0] && q <= e.rounds[1]);
function eligible(g, F, e, q, when) {
  if (e.memo && !['legend-wants-in', 'ten-x-engineer'].includes(e.id)) return false;
  if (e.when !== when || !inRounds(e, q) || (e.once !== false && g.world.seen[e.id])) return false;
  if (e.memo && (g.world.memos >= WORLD.memos || g.world.memo)) return false;
  return holds(g, F, e.if);
}
function pick(g, F, list, r) {
  if (!list.length) return null;
  return r.weighted(list.map(e => ({ w: Math.max(.01, e.weight ?? 1), v: e })));
}

// Round open: due follow-ups first, then at most one major, one minor and one flavor line.
export function worldOpen(g) {
  const w = g.world, a = g.arcade, q = g.q;
  w.spawns = []; w.news = []; w.forceTerm = null;
  // Revenue modifiers end early when their `unless` condition is met (e.g. you levelled up).
  const F0 = facts(g);
  g.company.mods.revenue = g.company.mods.revenue.filter(m => !(m.unless && holds(g, F0, m.unless)));
  const r = stream(g.seed, 'v106-world', 'open', q);
  for (const d of w.due.filter(d => d.q === q)) {
    const e = EVENTS.find(e => e.id === d.event);
    if (e && e.when === 'open' && eligible(g, facts(g), e, q, 'open') && r.next() < (d.chance ?? 1)) fire(g, e);
  }
  w.due = w.due.filter(d => !(d.q === q && EVENTS.find(e => e.id === d.event)?.when === 'open') && d.q >= q);
  roll(g, 'open', r);
  a.news = w.news.slice();
  return true;
}
function roll(g, when, r) {
  const w = g.world, q = when === 'open' ? g.q : g.arcade.history.at(-1).q, F = facts(g);
  // Weight 0 marks a follow-up: it only ever fires when an earlier event schedules it.
  const pool = size => EVENTS.filter(e => (e.size || 'minor') === size && (e.weight ?? 1) > 0 && eligible(g, F, e, q, when));
  const fired = w.news.filter(n => n.q === q && n.when === when);
  // One big thing a round: a scenario proposal (or a rival's sweep) takes the round's major slot.
  const quiet = when === 'open' && w.scen?.quietQ === q;
  if (!fired.some(n => n.size === 'major') && w.twists < WORLD.majorCap && r.next() < (w.twists >= WORLD.majors ? WORLD.major / 3 : WORLD.major) && !quiet) {
    const e = pick(g, F, pool('major'), r); if (e) fire(g, e);
  }
  if (!fired.some(n => n.size === 'minor') && r.next() < WORLD.minor) { const e = pick(g, facts(g), pool('minor'), r); if (e) fire(g, e); }
  if (!w.news.some(n => n.q === q && n.when === when) && r.next() < WORLD.flavor) { const e = pick(g, facts(g), pool('flavor'), r); if (e) fire(g, e); }
}

export function fire(g, e) {
  const w = g.world, q = e.when === 'bell' ? g.arcade.history.at(-1)?.q ?? g.q : g.q;
  w.seen[e.id] = q; w.seq++;
  if (e.size === 'major') w.twists++;
  const F = facts(g);
  const news = { id: e.id, q, when: e.when, size: e.size || 'minor', category: e.category, headline: fill(g, e.headline, F), detail: e.detail ? fill(g, e.detail, F) : '', tone: e.tone || 'plain', surface: e.surface || 'news' };
  w.news.push(news); w.log.push({ id: e.id, q, headline: news.headline });
  for (const fx of e.effects || []) apply(g, fx, e);
  if (e.memo) { w.memo = { event: e.id, q, prompt: fill(g, e.memo.prompt, F), options: e.memo.options.map(o => ({ label: o.label, note: o.note || '' })) }; w.memos++; }
  for (const f of e.follow || []) {
    const due=q+(f.after || 1);
    if (due<=ECONOMY.rounds) w.due.push({event:f.event,q:due,chance:f.chance ?? 1});
  }
  return true;
}
// Text placeholders: {company} {gpu} {product} {model} {round}.
function fill(g, text = '', F = facts(g)) {
  const c = g.company, product = c.products.at(-1)?.name || 'your product';
  return String(text).replace(/\{company\}/g, c.name).replace(/\{gpu\}/g, F.marketGpu || 'GPU').replace(/\{product\}/g, product)
    .replace(/\{model\}/g, (MODEL_NAMES[c.level] || MODEL_NAMES[0])).replace(/\{round\}/g, String(F.round));
}

// ---- Effects (SCHEMA §4) ----------------------------------------------------------------------
const askNow = (g, gpu) => ASK[gpu] * (1 + DRIFT * (g.q - 1));
function firmFor(g, kind, r) {
  const dealt = Object.entries(g.firms).filter(([, f]) => f.deals > 0);
  if (kind === 'trusted' && dealt.length) return dealt.sort((x, y) => y[1].trust - x[1].trust || x[0].localeCompare(y[0]))[0][0];
  if (kind === 'burned' && dealt.length) return dealt.sort((x, y) => x[1].trust - y[1].trust || x[0].localeCompare(y[0]))[0][0];
  if (kind === 'broker') return 'Grey Rack Brokers';
  const fresh = SELLER_FIRMS.filter(f => !g.firms[f]);
  return r.pick(fresh.length ? fresh : SELLER_FIRMS);
}
export function apply(g, fx, e) {
  const w = g.world, a = g.arcade, c = g.company, r = stream(g.seed, 'v106-fx', e.id, g.q, w.seq);
  switch (fx.op) {
    case 'lot': {
      const qty = Array.isArray(fx.qty) ? r.int(fx.qty[0], fx.qty[1]) : fx.qty || 2, ask = Math.max(50, Math.round(askNow(g, fx.gpu) * (fx.price ?? 1)));
      const room = fx.room === 'none' ? 0 : fx.room === 'wide' ? r.int(60, 90) : r.int(26, 52);
      const at = Math.max(0, Math.min(a.seconds - 8, fx.at ?? 0)), firm = firmFor(g, fx.firm, r);
      const replace=a.lots.findLastIndex(l=>l.status==='open' && !l.negotiation && !l.recovery && !['q1-start','q1-rack'].includes(l.id));
      if (replace<0) return;
      a.lots.splice(replace,1,{ id: `q${g.q}-w${w.seq}`, slot: 70 + w.seq % 20, firm, profile: fx.room === 'none' ? 'firm' : supplierStyle(firm), gpu: fx.gpu, qty, ask, floor: ask - room, liquidation: false,
        at, until: Math.min(a.seconds, at + (fx.window ?? 18)), flash: (fx.window ?? 18) < 18, cooldown: 0, status: 'open', negotiation: null, event: e.id, label: fx.label || '', line: fx.line || '' });
      a.lots.sort((x, y) => x.at - y.at);
      return;
    }
    case 'pull': case 'ask': case 'card':
      if ((fx.at ?? 0) <= a.time) return spawn(g, { ...fx, event: e.id });
      w.spawns.push({ ...fx, event: e.id, at: fx.at });
      return;
    case 'term': w.forceTerm = { investor: fx.investor, at: fx.at ?? 4, mods: fx.mods || {}, event: e.id }; return;
    case 'trust': {
      const dealt = Object.entries(g.firms).filter(([, f]) => f.deals > 0);
      if (!dealt.length) return;
      const pickF = fx.firm === 'all' ? dealt : [dealt.sort((x, y) => (fx.firm === 'worst' ? x[1].trust - y[1].trust : y[1].trust - x[1].trust) || x[0].localeCompare(y[0]))[0]];
      for (const [, f] of pickF) f.trust = Math.max(-4, Math.min(12, (f.trust || 0) + fx.delta));
      return;
    }
    case 'revenue': c.mods.revenue.push({ mult: clamp(fx.mult, .5, 1.5), left: fx.rounds || 1, unless: fx.unless || null, event: e.id }); return;
    case 'sentiment': w.sentiment.push({ delta: clamp(fx.delta, -.25, .25), left: fx.rounds || 1, event: e.id }); return;
    case 'odds': c.mods.odds = { breakthrough: clamp(fx.breakthrough || 0, -.2, .2), setback: clamp(fx.setback || 0, -.2, .3), event: e.id }; return;
    case 'burn': c.mods.burn.push({ delta: fx.delta | 0, left: fx.rounds || 1, event: e.id }); return;
    case 'prepay': {
      // A customer prepays N rounds of today's revenue, minus a discount: company cash now,
      // and those rounds' revenue arrives as already paid (honest timing, no new money).
      const per = revenueNow(c), rounds = Math.max(1, Math.min(2, fx.rounds || 1)), amount = Math.round(per * rounds * (1 - clamp(fx.discount ?? .1, 0, .3)));
      if (amount <= 0) return;
      g.cash = (Math.round(g.cash * 100) + amount) / 100; a.ledger.contracts += amount; w.prepaidTotal = (w.prepaidTotal || 0) + amount;
      c.mods.prepaid.push({ perRound: per, left: rounds, event: e.id });
      return;
    }
    case 'flag': w.flags[fx.name] = fx.value ?? true; return;
    // From a memo (between rounds) "after 1" means the round that opens next.
    case 'follow': {
      const due=(g.phase === 'report' ? g.q-1 : g.q)+(fx.after || 1);
      if (due<=ECONOMY.rounds) w.due.push({event:fx.event,q:due,chance:fx.chance ?? 1});
      return;
    }
    case 'exit': if (!w.exitMods.some(m => m.mod === fx.mod)) w.exitMods.push({ mod: fx.mod, mult: clamp(fx.mult, .85, 1.2), event: e.id }); return;
    default: return;
  }
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x) || 0));

// Timed effects fire on the floor clock (deterministic: state and time only).
export function worldTick(g) {
  const w = g.world; if (!w?.spawns?.length) return false;
  let any = false;
  for (const s of w.spawns.filter(s => s.at <= g.arcade.time)) { if (spawn(g, s) !== 'wait') { w.spawns.splice(w.spawns.indexOf(s), 1); any = true; } }
  return any;
}
function spawn(g, s) {
  const a = g.arcade, w = g.world, r = stream(g.seed, 'v106-spawn', s.event, g.q, a.time);
  if (s.op === 'pull') {
    const open = a.lots.filter(l => l.gpu === s.gpu && l.status === 'open' && !l.negotiation && l.id !== a.active && l.at <= a.time + 30);
    const n = Math.ceil(open.length * clamp(s.share, 0, 1));
    for (const l of r.shuffle(open).slice(0, n)) { l.status = 'expired'; l.pulled = true; }
    if (n) a.message = { text: `An outside order just bought ${n} ${s.gpu} ${n === 1 ? 'lot' : 'lots'} off the floor.`, tone: 'bad' };
    return true;
  }
  if (s.op === 'ask') {
    // A block a trusted firm holds for you keeps its promised price whatever the tape does.
    for (const l of a.lots) if (l.status === 'open' && !l.negotiation && !l.favor && (s.gpu === 'all' || l.gpu === s.gpu)) {
      const m = clamp(s.mult, .7, 1.4), room = l.ask - l.floor; l.ask = Math.max(50, Math.round(l.ask * m)); l.floor = Math.max(1, l.ask - Math.round(room * Math.min(1, m)));
    }
    return true;
  }
  if (s.op === 'card') {
    if (['offered', 'waiting', 'next'].includes(w.strategic?.state)) return true;
    // At most one Opportunity card is open at a time: a customer waits for the slot this round.
    if (a.objectives.some(o => o.lane === 'opportunity' && o.status === 'open')) return a.time < a.seconds - 10 ? 'wait' : true;
    const c = g.company; c.oppSeq++; c.cardSeq++;
    const recipe = { ...s.recipe }, now = Math.round(a.time), cost = recipeCost(recipe);
    const reward = s.reward?.revenue ? { revenue: s.reward.revenue } : { cash: Math.round(cost * clamp(s.reward?.cash ?? 1.4, 1, 2) * (1 + .03 * g.q) / 100) * 100 };
    a.objectives.push({ id: `q${g.q}-opp-${c.cardSeq}`, lane: 'opportunity', kind: s.kind || 'contract', tier: 0, name: s.name, blurb: s.blurb || '', recipe, mixed: isMixed(recipe), reward, q: g.q,
      at: now, until: Math.min(a.seconds, now + (s.window || 18)), status: 'open', event: s.event });
    w.flags[`card.${s.event}`] = true;
    return true;
  }
  return true;
}

// ---- The bell: memory, consequences, memos -----------------------------------------------------
export function worldBell(g, report) {
  const w = g.world, a = g.arcade, q = report.q;
  // Investors remember how this round's term sheets ended.
  for (const t of a.terms) if (t.investor) {
    const state = t.status === 'open' ? 'expired' : t.status;
    w.inv[t.investor] = { state, q, n: (w.inv[t.investor]?.n || 0) + 1, pct: t.openingPct };
  }
  // Modifiers that ran their course this bell.
  const c = g.company;
  for (const k of ['revenue', 'burn', 'prepaid']) c.mods[k] = c.mods[k].map(m => ({ ...m, left: m.left - 1 })).filter(m => m.left > 0);
  if (w.flags.engineerHired && !c.mods.burn.some(m => m.event === 'ten-x-engineer')) w.flags.engineerSalaryEnded = true;
  w.sentiment = w.sentiment.map(m => ({ ...m, left: m.left - 1 })).filter(m => m.left > 0);
  if (report.shortfall || c.shutdown || q >= ECONOMY.rounds) { report.world = { news: w.news.filter(n => n.q === q), memo: null }; return; }
  const r = stream(g.seed, 'v106-world', 'bell', q);
  for (const d of w.due.filter(d => d.q === q)) {
    const e = EVENTS.find(e => e.id === d.event);
    if (e && e.when === 'bell' && eligible(g, facts(g), e, q, 'bell') && r.next() < (d.chance ?? 1)) fire(g, e);
  }
  w.due = w.due.filter(d => d.q > q);
  roll(g, 'bell', r);
  report.world = { news: w.news.filter(n => n.q === q), memo: w.memo ? { ...w.memo } : null };
}

// The founder answers the board's memo (between rounds); the next round opens after.
export function chooseMemo(g, index) {
  const w = g.world, m = w?.memo;
  if (!m || g.phase !== 'report' || !Number.isSafeInteger(index) || index < 0 || index >= m.options.length) return false;
  const e = EVENTS.find(e => e.id === m.event), opt = e?.memo?.options?.[index];
  if (!opt) return false;
  w.flags[`memo.${e.id}`] = index;
  for (const fx of opt.effects || []) apply(g, fx, e);
  m.chosen = index; w.memo = null;
  const h = g.arcade.history.at(-1); if (h?.world?.memo) h.world.memo.chosen = index;
  return true;
}

// Pending board choices can be temporarily suspended during a between-round
// game. Validate the actual event and option text before saving/restoring one.
export function validPendingMemo(m) {
  const event=EVENTS.find(e=>e.id===m?.event),options=event?.memo?.options;
  return !!(m && options?.length===2 && Number.isSafeInteger(m.q) && m.q>=1 && m.q<=ECONOMY.rounds &&
    typeof m.prompt==='string' && m.chosen===undefined && Array.isArray(m.options) && m.options.length===2 &&
    m.options.every((o,i)=>o && o.label===options[i].label && o.note===(options[i].note || '')));
}

// ---- Investors' mood and the exit ---------------------------------------------------------------
export const sentimentOf = g => clamp((g.world?.sentiment || []).reduce((n, m) => n + m.delta, 0), ...WORLD.sentiment);
export function exitMarket(g, market) {
  const mods = g.world?.exitMods || [], m = mods.filter(x => x.mod !== 'sovereign-missed').reduce((x, mod) => x * mod.mult, 1);
  const contractual = mods.some(x => x.mod === 'sovereign-missed') ? .85 : 1;
  return (Math.round(clamp(market * m, .80, 1.35) * 100) / 100) * contractual;
}

// The epilogue: one line (and maybe a title) drawn from what actually happened.
export function epilogue(g, exit) {
  if (exit.kind === 'private') return {id:'v1172-private',title:exit.title,line:`Your CEO tenure ends. ${g.company.name} stays independent; your private shares remain an estimate, not cash.`};
  if (exit.kind === 'secondary') return {id:'v1172-secondary',title:exit.title,line:'You sell a quarter of your founder stake and retain the rest. Realized proceeds and paper value are shown separately.'};
  const F = { ...facts(g), exit: exit.kind, payout: exit.payout };
  const fits = EPILOGUES.filter(x => (x.kind === 'any' || x.kind === exit.kind || (x.kind === 'legendary' && exit.legendary)) && holds(g, F, x.if || []));
  if (!fits.length) return null;
  const best = Math.max(...fits.map(x => (x.if || []).length)), pool = fits.filter(x => (x.if || []).length >= Math.min(best, 2));
  const r = stream(g.seed, 'v106-epilogue', exit.kind, g.company.builds.length);
  const x = r.weighted(pool.map(x => ({ w: x.weight ?? 1, v: x })));
  return { id: x.id, title: x.title || null, line: fill(g, x.line, F) };
}
