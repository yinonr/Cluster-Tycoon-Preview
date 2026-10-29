// YOUR COMPANY: the founder's board. An inventory tray (free / reserved / rack-made GPUs in one
// colour system), the objective cards as GPU recipes with real slots, and the company's assets.
// Every figure is engine state (cardState, freeOf, companyStats, the build records). Slot taps
// call the engine's reserve/release; nothing here reserves, ranks or recommends on its own.
import { vultureReviewAvailable } from '../tycoon/investors.js';
import { esc } from '../util.js';
import { businessNext } from '../tycoon/commerce.js';
import { deliveryText } from '../tycoon/strategic.js';
import { PARTNERSHIPS } from '../tycoon/strategic-content.js';
import { moonshotOdds } from '../tycoon/moonshot.js';
import { moonshotStatus } from './moonshot.js';
import { scenarioStatus, scenarioCardTerms, scenarioWhat } from './scenarios.js';
import { V7, cash } from '../tycoon/arcade.js';
import { GPUS, MODEL_NAMES, FOUNDER, researchOdds, cardState, freeOf, freeIn, reservedOn, openCards, companyStats, rackOutput, opsOf, BOOSTS, boostMet, burnOf, cashRevenueNow, batchableCard, batchAvailability } from '../tycoon/founder.js';
import { NODE_GPUS, nodeGroups } from '../tycoon/integration.js';
import { sourcingQuote, sourcingLeft } from '../tycoon/founder-market.js';
import { money, short, rewardLine, laneOf, laneLabel, competesWith, reservedOf, rackStock, buildChange, plural } from './pit-ledger.js';

const gcls = gpu => `gpu-${String(gpu).toLowerCase()}`;
export const gchip = (gpu, cls = '', i = null) => `<i class="gchip ${gcls(gpu)} ${cls}"${i === null ? '' : ` style="--i:${i}"`} aria-hidden="true"></i>`;
export const gpuTag = gpu => `<span class="gtag ${gcls(gpu)}">${esc(gpu)}</span>`;
// One node is the integration engine's NODE_GPUS. Fleets and large allocations are only a
// compact view of those nodes; the inventory, reservations and recipes stay in individual GPUs.
export function allocationGroups(gpu, qty) {
  if (!GPUS.includes(gpu) || !Number.isSafeInteger(qty) || qty < 0) return [];
  const nodes = nodeGroups({ [gpu]: qty });
  let whole = nodes.filter(n => n.gpus === NODE_GPUS).length;
  const singles = nodes.filter(n => n.gpus < NODE_GPUS).reduce((n, x) => n + x.gpus, 0);
  const fleet = Math.floor(whole / 32); whole %= 32;
  const large = Math.floor(whole / 4); whole %= 4;
  return [['fleet', fleet, NODE_GPUS * 32], ['large', large, NODE_GPUS * 4], ['node', whole, NODE_GPUS], ['GPU', singles, 1]]
    .filter(([, count]) => count).map(([name, count, units]) => ({ name, count, units }));
}
const groupText = (gpu, qty) => allocationGroups(gpu, qty).map(x => `${x.count} ${x.name === 'GPU' ? 'GPUs' : x.name === 'large' ? `large allocation${x.count === 1 ? '' : 's'}` : `${x.name}${x.count === 1 ? '' : 's'}`}`).join(' + ');
const grouped = (gpu, qty, label) => qty >= NODE_GPUS ? `<span class="gpu-groups ${gcls(gpu)}" title="${qty} ${esc(gpu)} ${esc(label)}">${esc(groupText(gpu, qty))}</span>` : '';
const button = (action, inner, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${inner}</button>`;
const compact = () => { try { return matchMedia('(max-width: 760px)').matches; } catch { return false; } };
export { compact };

// A real time window (opportunities): the controller rewrites the text and --left every 250ms.
function fuse(until, at, now) {
  const left = Math.max(0, until - now), span = Math.max(1, until - at);
  return `<span class="pit-fuse fc-fuse ${left < 8 ? 'is-short' : ''}" data-fuse style="--left:${Math.min(1, left / span).toFixed(3)}"><b data-station-until="${until}" data-station-at="${at}">${Math.ceil(left)}s</b></span>`;
}

// ---- Which cards sit on the board ----------------------------------------------------------
// One slot per lane: the open card, else the lane's last build this round (stamped BUILT).
// The opportunity slot holds the open ticket, else the latest one this round (won or expired).
// Builds a follow-up card replaced go to a small shelf, so every build stays visible all round.
export function boardCards(g) {
  const objs = g.arcade.objectives, shown = new Set();
  const lanes = ['product', 'research', 'infra'].map(lane => {
    const card = objs.find(o => o.lane === lane && o.status === 'open') || objs.filter(o => o.lane === lane && o.status === 'built').at(-1) || null;
    if (card) shown.add(card.id);
    return { lane, card };
  });
  const opps = objs.filter(o => o.lane === 'opportunity');
  const opp = opps.find(o => o.status === 'open' && (!o.until || g.arcade.time < o.until)) || opps.at(-1) || null;
  if (opp) shown.add(opp.id);
  const shelf = objs.filter(o => o.status === 'built' && !shown.has(o.id));
  return { lanes, opp, shelf };
}

// ---- GPU slots ------------------------------------------------------------------------------
// Filled = reserved to this card (tap to release one). Empty = still needed: tap reserves one
// when free stock exists, otherwise it opens the market filtered to that GPU. A bar row reserves the
// whole row in one tap and releases it with its Release control.
export function slotsHTML(g, card, { live = true, big = false } = {}) {
  const st = cardState(g, card), built = card.status === 'built', can = live && st.live;
  return `<div class="fc-slots ${big ? 'is-big' : ''} ${st.total > 8 ? 'is-dense' : ''}">${st.rows.map(r => {
    // V10.15: a big row is one bar (tap it to fill the row from free stock): above 12 GPUs on the
    // desk, and every row of a floor card above 16 GPUs so the recipe never covers the build rail.
    if (r.need > BAR_FROM || (!big && st.total > FLOOR_BARS)) return barRow(g, card, r, { can, built });
    const chips = [];
    for (let i = 0; i < r.need; i++) {
      const filled = built || i < r.held, key = `data-slot="${esc(card.id)}|${r.gpu}|${i}"`;
      const cls = `slot ${gcls(r.gpu)} ${filled ? 'is-filled' : 'is-empty'} ${built ? 'is-locked' : ''}`;
      const inner = filled ? gchip(r.gpu) : '<i class="slot-hole" aria-hidden="true"></i>';
      if (!can || built) { chips.push(`<i class="${cls}" ${key} aria-hidden="true">${inner}</i>`); continue; }
      if (filled) chips.push(button('release', inner, `class="${cls}" ${key} data-card="${esc(card.id)}" data-gpu="${r.gpu}" aria-label="Release one ${r.gpu} from ${esc(card.name)}"`));
      else if (r.free > 0) chips.push(button('reserve', inner, `class="${cls} can-fill" ${key} data-card="${esc(card.id)}" data-gpu="${r.gpu}" aria-label="Reserve one ${r.gpu} for ${esc(card.name)}: ${r.free} free"`));
      else chips.push(button('open-market', inner, `class="${cls} is-wanting" ${key} data-filter="supply" data-gpu="${r.gpu}" aria-label="No free ${r.gpu}. Find ${r.gpu} on the floor for ${esc(card.name)}"`));
    }
    return `<span class="slot-row ${gcls(r.gpu)}"><span class="slot-label">${r.gpu}<small>${built ? r.need : r.held}/${r.need}</small></span><span class="slot-chips">${chips.join('')}</span></span>`;
  }).join('')}</div>`;
}

const BAR_FROM = 12, FLOOR_BARS = 16;
function barRow(g, card, r, { can, built }) {
  const held = built ? r.need : r.held, w = Math.round(100 * held / r.need), label = `${r.gpu} ${held}/${r.need}`;
  const bar = `<span class="slot-bar ${gcls(r.gpu)}" aria-hidden="true"><i style="width:${w}%"></i></span>`;
  const tag = `<span class="slot-label">${r.gpu}<small>${held}/${r.need}</small></span>`;
  if (!can || built) return `<span class="slot-row is-bar ${gcls(r.gpu)}" data-slot="${esc(card.id)}|${r.gpu}|bar">${tag}${bar}</span>`;
  const act = held >= r.need ? bar
    : r.free > 0 ? button('reserve', bar, `class="slot-bar-btn" data-card="${esc(card.id)}" data-gpu="${r.gpu}" data-qty="${Math.min(r.free, r.need - r.held)}" aria-label="Reserve ${Math.min(r.free, r.need - r.held)} ${r.gpu} for ${esc(card.name)}: ${label}"`)
    : button('open-market', bar, `class="slot-bar-btn is-wanting" data-filter="supply" data-gpu="${r.gpu}" aria-label="No free ${r.gpu}. Find ${r.gpu} on the floor for ${esc(card.name)}: ${label}"`);
  // Release returns this row's GPUs to free stock (other rows keep theirs), so a block can move between projects.
  const off = held ? button('release', 'Release', `class="slot-bar-release" data-card="${esc(card.id)}" data-gpu="${r.gpu}" data-qty="${held}" aria-label="Release ${held} ${r.gpu} from ${esc(card.name)}"`) : '';
  return `<span class="slot-row is-bar ${gcls(r.gpu)}" data-slot="${esc(card.id)}|${r.gpu}|bar">${tag}${act}${off}</span>`;
}
const canFill = st => st.rows.some(r => r.held < r.need && r.free > 0);
const deficit = st => st.rows.filter(r => r.held < r.need).map(r => `${r.need - r.held} ${r.gpu}`).join(' + ');
function partnershipTerms(g, card) {
  if (!card.strategic) return '';
  const p = PARTNERSHIPS.find(p => p.id === card.strategic.id);
  return `<details class="partnership-terms"><summary>Partnership terms · ${p.stages.length} stages</summary>` +
    p.stages.map((s, i) => `<p>Stage ${i + 1}: ${esc(s.name)} · ${Object.entries(s.recipe).map(([k, n]) => `${n} ${k}`).join(' + ')} → ${esc(rewardLine(g, s))}</p>`).join('') +
    '<p>Successive rounds after delivery. Later scope may change. Miss a deadline: the chain ends; prior rewards remain.</p></details>';
}
const pct = x => `${Math.round(x * 100)}%`;
// What the lane does, from the engine's own rule table (FOUNDER).
export function whatLine(card, g) {
  if (card.scenario) return scenarioWhat(card, g);
  if (card.moonshot !== undefined) { const p = moonshotOdds(g); return card.moonshot ? `${pct(p.legendary)} legendary · ${pct(p.setback)} setback` : 'Stage 1/2 · training follows integration'; }
  if (card.reward.ip) return 'Research IP · company valuation, not cash';
  if (card.kind === 'hire') return 'Leadership · upfront capital, recurring salary and disclosed equity';
  const odds = researchOdds(g, card);
  if (card.strategic) return `Due at this bell. ${card.mixed ? '75% integration delivers; otherwise one-round delay. ' : ''}${card.strategic.stage + 1 < card.strategic.total ? 'Next stage follows delivery; missing it ends the partnership.' : 'Final deployment; recurring customer revenue.'}`;
  if (card.kind === 'agi') return `Capital ${short(card.cashCost)} · 75% integration to run`;
  // V10.17.3 combinations: one short clause, checked when already met.
  const boost = card.boost ? ` · +${pct(BOOSTS[card.boost].pct)} ${BOOSTS[card.boost].label}${boostMet(g.company, card.boost) ? ' ✓' : ''}` : '';
  if (card.flagship) return (card.lane === 'product' ? `Flagship · integrates at the bell` : 'Flagship fleet · integrates at the bell') + boost;
  if (card.lane === 'product') return `Bell income · +${pct(FOUNDER.growth)}/round${boost}`;
  if (card.lane === 'research') return `${pct(odds.breakthrough)} breakthrough · ${pct(odds.setback)} setback${odds.engineer ? ' · Mara' : ''}${card.labSupply ? ' · lab supply −20%' : ''}`;
  if (card.lane === 'infra') return 'Free GPUs at every round open';
  if (card.kind === 'partner') return 'Investors notice a published breakthrough';
  if (card.kind === 'benchmark') return 'Research IP, kept in your valuation';
  if (card.kind === 'arbitrage') return 'Paid in cash when you deliver';
  if (card.kind === 'licensing') return 'Recurring contract revenue';
  if (card.kind === 'capacity') return 'Recurring lease from your racks';
  return 'One-off prize, paid when you build it';
}

// ---- A full card on the desktop board -------------------------------------------------------
export function cardTile(g, card, live = true) {
  if (card.deferred) return `<article class="fc lane-opportunity"><header class="fc-head">CONTRACT EXTENDED</header><b class="fc-name">${esc(card.name)}</b><p class="fc-what">${esc(scenarioWhat(card, g))}</p><p class="fc-reward">${esc(rewardLine(g, card))}</p></article>`;
  const st = cardState(g, card), lane = laneOf(card), built = card.status === 'built', expired = card.status === 'expired' || (card.status === 'open' && !st.live && card.until);
  const now = g.arcade.time, b = built ? g.company.builds.find(x => x.card === card.id) : null;
  const head = `<header class="fc-head"><span class="fc-lane">${esc(laneLabel(card).toUpperCase())}${card.kind === 'agi' ? '<i>AGI</i>' : card.flagship ? '<i>FLAGSHIP</i>' : card.tier ? `<i> · T${card.tier}</i>` : ''}</span>${card.mixed && !card.flagship && card.kind !== 'agi' ? '<span class="fc-mixed" title="Mixed GPUs: integration at the bell">MIXED</span>' : ''}${card.until && !built && !expired ? fuse(card.until, card.at, now) : ''}</header>`;
  const name = live && !built && st.live ? button('open-card', esc(card.name), `class="fc-name" data-card="${esc(card.id)}" aria-label="Open the ${esc(card.name)} card desk"`) : `<b class="fc-name">${esc(card.name)}</b>`;
  const change = b ? buildChange(g, b) : null;
  const foot = built ? `<footer class="fc-foot is-built"><span class="fc-result tone-${change.tone}"><b>${esc(change.head)}</b> ${esc(change.text)}</span></footer>`
    : expired ? `<footer class="fc-foot"><span class="fc-result">Window closed · GPUs released</span></footer>`
    // V10.17.3: a card short of three GPU types (a three-row flagship) shows each row's count on its bars; the
    // footer keeps the total so the NEED line cannot push BUILD off the card.
    : `<footer class="fc-foot"><span class="fc-count"><b>${st.held}</b>/${st.total} GPUs${st.cashNeeded ? `<small>Cash short ${short(st.cashNeeded)}</small>` : ''}${st.missing && st.rows.filter(r => r.held < r.need).length < 3 ? `<small>NEED ${deficit(st)}</small>` : ''}</span>` +
      (live && st.live ? `${canFill(st) && !st.ready ? button('fill', 'Fill', `class="fc-fill" data-card="${esc(card.id)}" aria-label="Fill ${esc(card.name)} from free stock"`) : ''}${button('build', 'BUILD', `class="fc-build ${st.ready ? 'is-lit' : ''}" data-card="${esc(card.id)}" ${st.ready ? '' : 'disabled'} aria-label="${st.ready ? 'Ready to build' : st.cashNeeded ? 'Missing cash' : 'Missing GPUs'}"`)}` : '') + '</footer>';
  const stamp = built ? `<strong class="fc-stamp" aria-hidden="true">${card.lane === 'opportunity' ? 'WON' : 'BUILT'}</strong>` : expired ? '<strong class="fc-stamp is-expired" aria-hidden="true">EXPIRED</strong>' : '';
  return `<article class="fc lane-${lane} ${card.flagship || card.kind === 'agi' ? 'is-flagship' : ''} ${st.ready ? 'is-ready' : ''} ${built ? 'is-built' : ''} ${expired ? 'is-expired' : ''} ${card.mixed ? 'is-mixed' : ''} ${card.scenario ? `is-scenario scn-${esc(card.scenario.key)}` : ''}" data-card-id="${esc(card.id)}" aria-label="${esc(laneLabel(card))}: ${esc(card.name)}. ${esc(rewardLine(g, card))}. ${built ? 'Built.' : `${st.held} of ${st.total} GPUs reserved.`}">` +
    `${head}${name}<p class="fc-blurb">${esc(card.blurb || '')}</p><p class="fc-reward">${esc(rewardLine(g, card))}</p>${card.cashCost ? `<p class="fc-capital">CAPITAL · ${short(card.cashCost)}</p>` : ''}<p class="fc-what">${esc(card.strategic ? `Due this bell${card.mixed ? ' · 75% integration or 1-round delay' : ''}` : whatLine(card, g))}</p>${slotsHTML(g, card, { live })}${foot}${stamp}</article>`;
}

function emptyLane(g, lane) {
  if (lane === 'research' && g.company.researchClosed) return '<article class="fc lane-research is-empty"><header class="fc-head">RESEARCH</header><p class="fc-empty">Lab permanently closed</p></article>';
  if (lane === 'research' && g.world.institutional?.moonshot?.state.endsWith('-integrating')) return '<article class="fc lane-research is-empty"><header class="fc-head">FRONTIER RESEARCH</header><p class="fc-empty">Cluster integration pending at the bell. The commitment remains active.</p></article>';
  const c = g.company, built = c.builds.some(b => b.q === g.q && b.lane === lane);
  const text = lane === 'research' && c.agi ? `AGI attempt made · ${MODEL_NAMES[c.level]}` : lane === 'research' && built ? 'Next run deals next round'
    : lane === 'research' ? `Model: ${MODEL_NAMES[c.level]}` : built ? 'Next card deals next round' : 'Lane complete: grow or train for bigger projects';
  return `<article class="fc lane-${lane} is-empty" aria-label="${esc(text)}"><header class="fc-head"><span class="fc-lane">${lane === 'infra' ? 'INFRASTRUCTURE' : lane.toUpperCase()}</span></header><p class="fc-empty">${esc(text)}</p></article>`;
}
const emptyOpp = g => g.world.strategic?.state === 'waiting'
  ? `<article class="fc lane-opportunity is-empty"><header class="fc-head"><span class="fc-lane">PARTNERSHIP</span></header><p class="fc-empty">${esc(PARTNERSHIPS.find(p => p.id === g.world.strategic.id).name)}: integration delayed until this bell. The next stage opens after delivery.</p></article>`
  : '<article class="fc lane-opportunity is-empty is-quiet"><header class="fc-head"><span class="fc-lane">OPPORTUNITY</span></header><p class="fc-empty">No live opportunity. Pilots follow a product launch; rushes and partnerships arrive on their own.</p></article>';

// ---- The inventory tray: one stack per GPU ------------------------------------------------
export function tray(g, live = true) {
  return `<section class="tray" aria-label="Your GPUs">${GPUS.map(gpu => {
    const free = freeOf(g, gpu), res = reservedOf(g, gpu), rack = rackStock(g, gpu), pile = Math.min(6, free);
    const label = `${gpu}: ${free} free, ${res} reserved${rack ? `, ${rack} rack-produced remaining` : ''}. Find ${gpu} on the floor`;
    const [groupKind, groupQty] = [['free', free], ['reserved', res], ['rack-produced remaining', rack]].sort((a, b) => b[1] - a[1])[0];
    const groups = groupQty >= NODE_GPUS ? `<span class="stack-group-line ${gcls(gpu)}"><b>${groupKind}</b> ${grouped(gpu, groupQty, groupKind)}</span>` : '';
    const inner = `<span class="stack-pile" aria-hidden="true">${Array.from({ length: Math.max(1, pile) }, (_, i) => gchip(gpu, free ? '' : 'is-ghost', i)).join('')}</span>` +
      `<span class="stack-copy"><span class="stack-name">${gpu}</span><b class="stack-free">${free}</b><small>free</small></span>` +
      `<span class="stack-meta">${res ? `<span class="stack-res">${res} reserved</span>` : ''}${rack ? `<span class="stack-rack">${rack} rack-produced</span>` : ''}</span>` +
      (groups ? `<span class="stack-groups">${groups}</span>` : '');
    return live ? button('open-market', inner, `class="stack ${gcls(gpu)} ${free ? '' : 'is-none'} ${groups ? 'is-grouped' : ''}" data-filter="supply" data-gpu="${gpu}" aria-label="${esc(label)}"`) : `<div class="stack ${gcls(gpu)} ${free ? '' : 'is-none'} ${groups ? 'is-grouped' : ''}" aria-hidden="true">${inner}</div>`;
  }).join('')}</section>`;
}

// Phones: one line of free counts above the card strip.
export function trayRow(g) {
  const chips = GPUS.map(gpu => { const free = freeOf(g, gpu); return `<span class="inv-chip ${gcls(gpu)} ${free ? '' : 'is-none'}">${gchip(gpu)}<b>${free}</b>${gpu}</span>`; }).join('');
  const res = GPUS.reduce((n, gpu) => n + reservedOf(g, gpu), 0);
  const due = g.company.compute.flatMap(k => k.tranches).filter(d => d.status === 'pending');
  const groups = GPUS.map(gpu => {
    const free = freeOf(g, gpu), held = reservedOf(g, gpu), rack = rackStock(g, gpu);
    const parts = [['free', free], ['reserved', held], ['rack-produced', rack]].filter(([, n]) => n >= NODE_GPUS)
      .map(([kind, n]) => `<span><b>${kind}</b> ${grouped(gpu, n, kind)}</span>`).join('');
    return parts ? `<span class="inv-group-item ${gcls(gpu)}"><b>${gpu}</b> ${parts}</span>` : '';
  }).filter(Boolean).join('');
  return `<div class="inv-row" role="group" aria-label="Free GPUs: ${GPUS.map(gpu => `${freeOf(g, gpu)} ${gpu}`).join(', ')}; ${res} reserved"><span class="inv-tag">FREE</span>${chips}${res ? `<span class="inv-res">${res} held</span>` : ''}</div>` +
    (groups ? `<div class="inv-group-row" aria-label="Grouped GPU capacity">${groups}</div>` : '') +
    (due.length ? `<details class="compute-schedule"><summary>Contracted compute · ${due.reduce((n, d) => n + d.qty, 0)} GPUs due</summary><p>${esc(deliveryText(due))}. Unused units expire at their delivery bell.</p></details>` : '') +
    (g.world.strategic?.state === 'waiting' ? '<p class="strategic-status">Partnership integration delayed to this bell.</p>' : '') + statusRow(g);
}
// One row for the Frontier program and the Deal Room's chips, so commitments never cost a card its height.
const statusRow = g => { const html = moonshotStatus(g) + scenarioStatus(g); return html ? `<div class="status-row">${html}</div>` : ''; };

// ---- The company's assets in one line ---------------------------------------------------
export function assets(g) {
  const s = companyStats(g), racks = rackOutput(g.company);
  const due = g.company.compute.flatMap(k => k.tranches).filter(d => d.status === 'pending');
  const deal = g.world.strategic;
  const o = opsOf(g.company), ops = [['serving', o.serving], ['research', o.research], ['readiness', o.readiness]].filter(([, v]) => v >= .005);
  return `<p class="assets"><span><i>Products</i> <b>${s.products}</b>${s.products ? ` · ${money(s.revenue)}/rd` : ''}</span><span><i>Model</i> <b>${esc(s.model)}</b></span><span><i>Racks</i> <b>${racks.length ? racks.map(([gpu, n]) => `+${n} ${gpu}`).join(' ') : 'none'}</b>${racks.length ? '/rd' : ''}</span>${ops.length ? `<span class="assets-ops" title="Integration bonuses earned at the bell"><i>Integration</i> <b>${ops.map(([k, v]) => `+${Math.round(v * 100)}% ${k}`).join(' · ')}</b></span>` : ''}</p>` +
    (due.length ? `<p class="assets strategic-status">Contracted compute: ${esc(deliveryText(due))}. Expires at each delivery bell.</p>` : '') +
    (deal ? `<p class="assets strategic-status">${esc(PARTNERSHIPS.find(p => p.id === deal.id).name)} · ${deal.state === 'waiting' ? 'Integration delayed; next stage waits for delivery.' : esc(deal.state)} · ${deal.history.length} stages delivered</p>` : '') + statusRow(g);
}

export function companyBoard(g, ui = {}, live = true) {
  const { lanes, opp, shelf } = boardCards(g), s = companyStats(g);
  const tiles = lanes.map(({ lane, card }) => card ? cardTile(g, card, live) : emptyLane(g, lane)).join('') + (opp ? cardTile(g, opp, live) : emptyOpp(g));
  const shelfHTML = shelf.length ? `<ul class="shelf" aria-label="${shelf.length} earlier builds this round">${shelf.slice(-1).map(o => `<li class="lane-${laneOf(o)}"><b>✓ ${esc(o.name)}</b>${shelf.length > 1 ? `<span>+${shelf.length - 1} built</span>` : ''}</li>`).join('')}</ul>` : '';
  return `<section class="company" aria-label="Your company">
    <header class="company-head"><span class="company-tag">YOUR COMPANY</span><b>${esc(s.focus)}</b><small>Unbuilt GPUs expire at the bell</small></header>
    ${tray(g, live)}
    <div class="cards">${tiles}</div>
    ${shelfHTML}${assets(g)}
  </section>`;
}

// ---- Phones: a strip of compact cards; a tap opens the card desk --------------------------
function compactCard(g, card, live) {
  if (card.deferred) return `<div class="fcc lane-opportunity"><span class="fcc-lane">CONTRACT EXTENDED</span><b class="fcc-name">${esc(card.name)}</b><span class="fcc-reward">${esc(scenarioWhat(card, g))}</span></div>`;
  const st = cardState(g, card), built = card.status === 'built', expired = card.status === 'expired' || (card.status === 'open' && !st.live && card.until);
  const chips = st.rows.map(r => `<span class="fcc-resource ${gcls(r.gpu)}"><span>${r.gpu} <b>${built ? r.need : r.held}/${r.need}</b></span><span class="fcc-units" aria-hidden="true">${r.need > BAR_FROM ? `<span class="slot-bar ${gcls(r.gpu)}"><i style="width:${Math.round(100 * (built ? 1 : r.held / r.need))}%"></i></span>` : Array.from({ length: r.need }, (_, i) => `<i class="mini ${built || i < r.held ? 'is-filled' : ''}" data-slot="${esc(card.id)}|${r.gpu}|${i}"></i>`).join('')}</span></span>`).join('');
  const state = built ? `<span class="fcc-state is-built">${card.lane === 'opportunity' ? 'WON' : 'BUILT'}</span>` : expired ? '<span class="fcc-state is-expired">EXPIRED</span>' : st.ready ? '<span class="fcc-state is-ready">BUILD</span>' : `<span class="fcc-state"><b>${st.held}</b>/${st.total}</span>`;
  const inner = `<span class="fcc-lane">${esc(laneLabel(card).toUpperCase())}${card.kind === 'agi' ? ' · AGI' : card.flagship ? ' · FLAGSHIP' : card.mixed ? ' · MIXED' : ''}</span><b class="fcc-name">${esc(card.name)}</b><span class="fcc-reward">${esc(rewardLine(g, card))}</span>${card.cashCost ? `<span class="fc-capital">Capital ${short(card.cashCost)}${st.live && st.cashNeeded ? ` · Short ${short(st.cashNeeded)}` : ''}</span>` : ''}<span class="fcc-foot"><span class="fcc-chips">${chips}</span>${state}</span>${!built && !expired && st.missing ? `<span class="fcc-deficit">NEED ${deficit(st)}</span>` : ''}${card.until && !built && !expired ? fuse(card.until, card.at, g.arcade.time) : ''}`;
  const cls = `fcc lane-${laneOf(card)} ${st.ready ? 'is-ready' : ''} ${built ? 'is-built' : ''} ${expired ? 'is-expired' : ''} ${card.scenario ? 'is-scenario' : ''}`;
  const label = `${laneLabel(card)}: ${card.name}. ${rewardLine(g, card)}. ${built ? 'Built' : expired ? 'Expired' : st.ready ? 'Ready to build' : `${st.held} of ${st.total} GPUs reserved`}. Open the card desk`;
  return live && !built && !expired ? button('open-card', inner, `class="${cls}" data-card="${esc(card.id)}" data-card-id="${esc(card.id)}" aria-label="${esc(label)}"`) : `<div class="${cls}" data-card-id="${esc(card.id)}" ${live ? `role="group" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${inner}</div>`;
}

export function cardStrip(g, live = true) {
  const { lanes, opp, shelf } = boardCards(g);
  const list = [...lanes.map(x => x.card).filter(Boolean), ...(opp ? [opp] : [])];
  // The work in front of you leads: ready cards, then a ticking opportunity, then the rest of the
  // open cards; builds follow, stamped.
  const open = list.filter(c => c.status === 'open'), ready = c => cardState(g, c).ready ? 0 : c.until ? 1 : 2;
  const ordered = [...open.map((c, i) => [c, i]).sort((x, y) => ready(x[0]) - ready(y[0]) || x[1] - y[1]).map(([c]) => c), ...list.filter(c => c.status !== 'open'), ...shelf];
  return `<div class="strip" role="group" aria-label="Objective cards">${ordered.map(c => compactCard(g, c, live)).join('')}</div>`;
}

// ---- The card desk: one card, full size, with its GPUs and its competition -------------------
export function researchRunway(g, card) {
  if (card.lane !== 'research' || card.status !== 'open') return null;
  const burn=burnOf(g.company), revenue=cashRevenueNow(g.company), remaining=Math.max(0,cash(g)-(card.cashCost||0));
  const gap=burn-revenue-remaining;
  return gap>Math.max(50000,Math.round(burn*.15)) ? {burn,revenue,remaining,gap} : null;
}
function repeatNote(card) {
  if (!card.repeat) return '';
  const rate=Math.round((card.flagship?FOUNDER.flagshipRepeat:FOUNDER.expansion)*100);
  return `Repeat build #${card.repeat+1} · ${rate}% base ${card.lane==='infra'?'rack output, rounded to whole GPUs':'return'} before company bonuses. The quoted reward is this build’s addition.`;
}
function inventoryLots(g, card) {
  const types = new Set(Object.keys(card.recipe));
  const lots = g.arcade.inventory.filter(x => types.has(x.gpu) && x.left > 0);
  return `<details class="cd-inventory-lots"><summary>Inspect stock · ${lots.length} ${lots.length === 1 ? 'lot' : 'lots'}</summary>` +
    (lots.some(x => x.produced) ? '<small>Rack-produced stock is included in free and reserved totals.</small>' : '') +
    (lots.length ? `<ul>${lots.map(x => `<li class="${gcls(x.gpu)}"><b>${gpuTag(x.gpu)} ${esc(x.firm || x.id)}</b><span>${x.left} left · ${freeIn(g, x)} free · ${reservedOn(g, x.id)} reserved${x.produced ? ' · rack-produced' : ''}</span></li>`).join('')}</ul>` : '<p>No stock of the GPUs this project needs.</p>') + '</details>';
}
function batchReason(block) {
  if (!block) return '';
  if (block.code === 'cash') return `Need ${money(block.cents)} more cash for this build.`;
  if (block.code === 'gpus') return `Need ${block.missing.map(x => `${x.qty} ${x.gpu}`).join(' + ')} beyond free stock.`;
  return 'This project needs its own BUILD decision.';
}
export function cardDeskView(g, ui) {
  const card = g.arcade.objectives.find(o => o.id === ui.cardId);
  if (!card) return null;
  const st = cardState(g, card), built = card.status === 'built', lane = laneOf(card), now = g.arcade.time;
  const rivals = competesWith(g, card);
  const shared = rivals.map(o => `${esc(o.name)} (${Object.keys(o.recipe).filter(k => card.recipe[k]).join(', ')})`);
  const rows = st.rows.map(r => {
    const need = r.need - r.held;
    const find = need > 0 && !r.free ? button('open-market', `Find ${r.gpu}`, `class="mat-exit cd-find" data-filter="supply" data-gpu="${r.gpu}" aria-label="Find ${r.gpu} on the floor"`) : '';
    const groups = [['needed', r.need], ['reserved here', r.held], ['free', r.free]].filter(([, n]) => n >= NODE_GPUS)
      .map(([kind, n]) => `<span>${kind}: ${grouped(r.gpu, n, kind)}</span>`).join('');
    return `<p class="cd-row ${gcls(r.gpu)}"><span class="cd-gpu">${gpuTag(r.gpu)}</span><span class="cd-figs"><b>${r.held}/${r.need}</b> reserved · <b>${r.free}</b> free</span>${find}${groups ? `<small class="cd-row-groups">${groups}</small>` : ''}</p>`;
  }).join('');
  const next = businessNext(card);
  const run=researchRunway(g,card);
  const economics=`<section class="cd-economics" aria-label="This build's economics"><b>THIS BUILD</b><span>GPUs: ${st.rows.map(r=>`${r.need} ${r.gpu}`).join(' + ')||'none'}</span><span>Additional capital: ${money(card.cashCost||0)}</span><span>Expected reward: ${esc(rewardLine(g,card))}</span>${card.repeat?`<small>${esc(repeatNote(card))}</small>`:''}</section>`;
  const block = batchAvailability(g, card), showBulk = st.live && batchableCard(card) && (g.company.scale || 1) >= 2;
  const bulk = showBulk ? `<section class="cd-bulk" aria-label="Build multiple projects"><b>BUILD ×</b>${[1,5,10,'max'].map(n => button('build-batch', n === 'max' ? 'MAX' : `×${n}`, `data-card="${esc(card.id)}" data-count="${n}" ${block ? `disabled title="${esc(batchReason(block))}"` : ''} aria-label="Build ${n === 'max' ? 'as many eligible projects as stock allows' : `up to ${n} eligible ${n === 1 ? 'project' : 'projects'}`} in one action${block ? `: ${esc(batchReason(block))}` : ''}"`)).join('')}${block ? `<small>${esc(batchReason(block))}</small>` : '<small>Uses only free GPUs. Each follow-up is checked separately.</small>'}</section>` : '';
  const runway=run?`<p class="cd-runway">At the current run rate, next round's operating costs (${money(run.burn)}) exceed ${card.cashCost?'cash after this build’s capital':'cash'} (${money(run.remaining)}) plus recurring cash revenue (${money(run.revenue)}). Research could leave you short at the bell.</p>`:'';
  const businessPlan = next ? `<details class="business-plan"><summary>Next: ${esc(next.name)}</summary><p>After delivery, in a later round (R${next.round} or later). ${next.scale === 3 ? 'AI Giant' : 'Scale-up'} · model ${esc(MODEL_NAMES[next.level])}. ${Object.entries(next.recipe).map(([k,n])=>`${n} ${k}`).join(' + ')} · ${money(next.capital)} capital. Adds ${money(next.revenue)}/round base before operating costs, integration and outcomes.</p></details>` : '';
  const body = `<div class="desk-center"><article class="card-desk mat-paper lane-${lane} ${st.ready ? 'is-ready' : ''}" data-card-id="${esc(card.id)}">` +
    `<header class="cd-head"><span>${esc(laneLabel(card).toUpperCase())}${card.kind === 'agi' ? ' · AGI ATTEMPT' : card.flagship ? ' · FLAGSHIP' : card.tier ? ` · TIER ${card.tier}` : ''}</span>${card.mixed ? '<span class="fc-mixed">MIXED · integration at the bell</span>' : ''}${card.until && st.live ? fuse(card.until, card.at, now) : ''}</header>` +
    `<p class="cd-capital-status"><b>${!st.live ? 'CLOSED' : st.ready ? 'READY TO BUILD' : st.missing && st.cashNeeded ? 'MISSING GPUs + CASH' : st.cashNeeded ? 'MISSING CASH' : st.missing ? 'MISSING GPUs' : 'CLOSED'}</b><br>Capital ${money(card.cashCost || 0)} · Cash available ${money(cash(g))}${st.cashNeeded ? `<br>Shortfall: ${money(st.cashNeeded)}` : ''}</p><p class="cd-blurb">${esc(card.blurb || '')}</p><p class="cd-reward">${esc(rewardLine(g, card))}</p><p class="cd-what">${esc(whatLine(card, g))}</p>${economics}${g.world.vulture?.attemptQ === g.q && !g.arcade.terms.some(t => t.vulture) ? '<p>No emergency investor is willing to fund this gap this round.</p>' : ''}${bulk}${runway}${partnershipTerms(g, card)}${scenarioCardTerms(g, card)}` +
    (card.cashCost ? `<p class="frontier-capital">BUILD spends ${money(card.cashCost)} cash plus these GPUs.${st.cashNeeded ? ` You need ${money(st.cashNeeded)} more cash to build this project.` : ''}</p>` : '') +
    `${slotsHTML(g, card, { live: !built, big: true })}<div class="cd-rows">${rows}</div>${inventoryLots(g, card)}` +
    businessPlan +
    (shared.length ? `<p class="cd-compete"><span>Competes with</span> ${shared.join(' · ')}</p>` : '') +
    (st.held && st.live ? button('release', `Release all ${st.held}`, `class="mat-exit cd-release" data-card="${esc(card.id)}" data-all="1" aria-label="Release all ${st.held} reserved GPUs from ${esc(card.name)}"`) : '') +
    `</article></div>`;
  const missingGpu = st.rows.find(r => r.held < r.need && !r.free)?.gpu;
  const commit = !st.live ? '' : st.ready
    ? button('build', `<span class="vault-lock" aria-hidden="true"></span><b>BUILD</b><span class="vault-amt">${esc(rewardLine(g, card))}</span>`, `class="mat-vault rail-commit is-build" data-primary data-card="${esc(card.id)}" aria-label="Build ${esc(card.name)} now: irreversible"`)
    : canFill(st) ? button('fill', `<b>FILL FROM STOCK</b>`, `class="mat-vault rail-commit" data-primary data-card="${esc(card.id)}" aria-label="Fill ${esc(card.name)} from free stock"`)
    : missingGpu ? button('open-market', `Find ${missingGpu} <span aria-hidden="true">→</span>`, `class="mat-move rail-commit" data-primary data-filter="supply" data-gpu="${missingGpu}"`) : '';
  return { title: card.name, role: 'card', desk: 'card', exit: null,
    body, footer: button('close-focus', 'Back to the floor', 'class="mat-exit rail-quiet"') + sourceLine(g, card) + (vultureReviewAvailable(g, card) ? button('review-vulture', 'Review emergency financing', `class="mat-move" data-card="${esc(card.id)}"`) : '') + (commit || `<span class="rail-fact">${st.cashNeeded ? `Need ${money(st.cashNeeded)} cash` : st.missing ? `${plural(st.missing, 'GPU')} missing` : ''}</span>`) };
}

// V10.15 sourcing order: one tap brings a dedicated block for this project's largest missing GPU.
function sourceLine(g, card) {
  const q = card.status === 'open' ? sourcingQuote(g, card) : null;
  if (!q) return '';
  const total = Math.round(q.qty * q.rate * V7.hours);
  return `${button('source-block', `<b>SOURCE ${q.qty} ${q.gpu}</b><span>+${Math.round((q.premium - 1) * 100)}% · ~${short(total)} · ${plural(sourcingLeft(g), 'order')} left</span>`, `class="mat-move cd-source-btn" data-card="${esc(card.id)}" aria-label="Place a sourcing order: ${q.qty} ${q.gpu} for ${esc(card.name)} at ${Math.round((q.premium - 1) * 100)}% over market, about ${short(total)}. It arrives on the floor in a few seconds; you can still negotiate"`)}`;
}

// ---- The build moment ---------------------------------------------------------------------
function batchBuiltView(g) {
  const receipt = g.arcade.confirm.batch, ids = new Set(receipt.ids);
  const builds = g.company.builds.filter(b => ids.has(b.id));
  if (builds.length !== ids.size) return null;
  const deployed = GPUS.map(gpu => [gpu, builds.reduce((n, b) => n + (b.recipe[gpu] || 0), 0)]).filter(([, n]) => n);
  const onlineRevenue = g.company.products.filter(p => ids.has(p.build) && !p.lost).reduce((n, p) => n + p.revenue, 0);
  const pendingRevenue = builds.filter(b => b.status === 'integrating').reduce((n, b) => n + (b.reward.revenue || 0), 0);
  const onlineRacks = GPUS.map(gpu => [gpu, g.company.racks.filter(r => ids.has(r.build) && r.gpu === gpu).reduce((n, r) => n + r.qty, 0)]).filter(([, n]) => n);
  const pendingRacks = GPUS.map(gpu => [gpu, builds.filter(b => b.status === 'integrating' && b.reward.rack?.gpu === gpu).reduce((n, b) => n + b.reward.rack.qty, 0)]).filter(([, n]) => n);
  const gpuCost = builds.reduce((n, b) => n + b.cost, 0), capital = builds.reduce((n, b) => n + (b.cashCost || 0), 0);
  const stop = receipt.stop, next = receipt.next && g.arcade.objectives.find(o => o.id === receipt.next);
  const nextLine = stop?.code === 'gpus' ? `Next: ${stop.name} needs ${stop.missing.map(x => `${x.qty} ${x.gpu}`).join(' + ')} more.`
    : stop?.code === 'cash' ? `Next: ${stop.name} needs ${money(stop.cents)} more cash.`
    : stop?.code === 'special' ? `Next: ${stop.name} needs a separate BUILD decision.`
    : stop?.code === 'no-followup' ? 'No repeatable follow-up is available this round.'
    : stop?.code === 'validation' ? 'Stopped because the next build did not validate.'
    : next ? `Next project: ${next.name}.` : 'All requested builds are complete.';
  const gpuLine = deployed.map(([gpu, n]) => `<span class="${gcls(gpu)}"><b>${n} ${gpu}</b>${n >= NODE_GPUS ? ` <small>${esc(groupText(gpu, n))}</small>` : ''}</span>`).join(' + ');
  const rackLine = (rows, suffix) => rows.length ? `<p>${rows.map(([gpu, n]) => `+${n} ${gpu}`).join(' + ')} rack GPUs/round ${suffix}</p>` : '';
  const s = companyStats(g);
  return { title: `${builds.length} projects built`, role: 'card', desk: 'built', exit: null,
    body: `<div class="desk-center"><article class="build-moment batch-moment mat-paper lane-${builds[0].lane}" data-fx-payoff>` +
      `<header class="contract-head"><span>${esc(laneLabel(builds[0]).toUpperCase())}</span><span>ROUND ${g.q}</span></header>` +
      `<strong class="bm-stamp" data-fx-stamp>${builds.length} PROJECTS BUILT</strong>` +
      `<p class="batch-deployed">${gpuLine} deployed</p>` +
      `<div class="batch-results">${onlineRevenue ? `<p><b>+${money(onlineRevenue)}/round</b> revenue online now</p>` : ''}` +
      `${pendingRevenue ? `<p><b>+${money(pendingRevenue)}/round</b> base revenue awaiting integration</p>` : ''}` +
      `${rackLine(onlineRacks, 'online now')}${rackLine(pendingRacks, 'awaiting integration')}` +
      `<p>GPU acquisition cost of deployed lots: ${money(gpuCost)} (paid at purchase)</p>` +
      (capital ? `<p>Additional capital spent: ${money(capital)}</p>` : '') +
      `<p class="batch-next">${esc(nextLine)}</p></div>` +
      `<p class="bm-company"><span>Valuation <b>${short(s.valuation)}</b></span><span>Revenue <b>${money(s.revenue)}</b>/rd</span></p>` +
      `</article></div>`,
    footer: button('post-receipt', 'Back to the floor <span aria-hidden="true">→</span>', 'class="mat-move rail-commit rail-solo" data-primary') };
}
export function builtView(g, ui = {}) {
  if (g.arcade.confirm?.batch) return batchBuiltView(g);
  const a = g.arcade, b = g.company.builds.find(x => x.id === a.confirm.built);
  if (!b) return null;
  const card = a.objectives.find(o => o.id === b.card) || { ...b, id: b.card, status: 'built', reward: b.reward };
  const ch = buildChange(g, b);
  // Cards the build dealt: open now, not open before it (the controller remembers the ids it saw).
  const before = ui.openBefore ? new Set(ui.openBefore.ids) : null;
  const dealt = before ? a.objectives.filter(o => o.status === 'open' && !before.has(o.id)) : [];
  let n = 0;
  const chips = GPUS.filter(k => b.recipe[k]).map(k => Array.from({ length: b.recipe[k] }, () => gchip(k, 'is-locking', n++)).join('')).join('');
  const s = companyStats(g);
  return { title: b.lane === 'opportunity' ? 'Opportunity won' : 'Built', role: 'card', desk: 'built', exit: null,
    body: `<div class="desk-center"><article class="build-moment mat-paper lane-${laneOf(card)} tone-${ch.tone}" data-fx-payoff>` +
      `<header class="contract-head"><span>${esc(laneLabel(card).toUpperCase())}</span><span>ROUND ${g.q}</span></header>` +
      `<strong class="bm-stamp" data-fx-stamp>${b.lane === 'opportunity' ? 'WON' : 'BUILT'}</strong><h3 class="bm-name">${esc(b.name)}</h3>` +
      `<div class="bm-chips" aria-hidden="true">${chips}</div>` +
      `<p class="bm-change"><b>${esc(ch.head)}</b><span>${esc(ch.text)}</span></p>` +
      (b.mixed && b.status === 'integrating' ? '<p class="bm-note">MIXED · the integration crew brings it online at the bell</p>' : '') +
      `<p class="bm-company"><span>Valuation <b data-fx-valuation data-fx-format="short">${short(s.valuation)}</b></span><span>Revenue <b>${money(s.revenue)}</b>/rd</span><span>Model <b>${esc(s.model)}</b></span></p>` +
      (dealt.length ? `<p class="bm-dealt"><span>New</span> ${dealt.map(o => `<b class="lane-${laneOf(o)}">${esc(o.name)}</b>`).join(' · ')}</p>` : '') +
      `<p class="payoff-fine">Cost of the GPUs consumed: ${money(b.cost)}${b.cashCost ? `; capital spent: ${money(b.cashCost)}` : ''}</p></article></div>`,
    footer: button('post-receipt', 'Back to the floor <span aria-hidden="true">→</span>', 'class="mat-move rail-commit rail-solo" data-primary') };
}

export const roundsLeft = g => V7.rounds - g.q;
