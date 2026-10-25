// YOUR COMPANY: the founder's board. An inventory tray (free / reserved / rack-made GPUs in one
// colour system), the objective cards as GPU recipes with real slots, and the company's assets.
// Every figure is engine state (cardState, freeOf, companyStats, the build records). Slot taps
// call the engine's reserve/release; nothing here reserves, ranks or recommends on its own.
import { esc } from '../util.js';
import { deliveryText } from '../tycoon/strategic.js';
import { PARTNERSHIPS } from '../tycoon/strategic-content.js';
import { moonshotOdds } from '../tycoon/moonshot.js';
import { moonshotStatus } from './moonshot.js';
import { scenarioStatus, scenarioCardTerms, scenarioWhat } from './scenarios.js';
import { V7 } from '../tycoon/arcade.js';
import { GPUS, MODEL_NAMES, FOUNDER, researchOdds, cardState, freeOf, openCards, companyStats, rackOutput } from '../tycoon/founder.js';
import { money, short, rewardLine, laneOf, laneLabel, competesWith, reservedOf, rackStock, buildChange, plural } from './pit-ledger.js';

const gcls = gpu => `gpu-${String(gpu).toLowerCase()}`;
export const gchip = (gpu, cls = '', i = null) => `<i class="gchip ${gcls(gpu)} ${cls}"${i === null ? '' : ` style="--i:${i}"`} aria-hidden="true"></i>`;
export const gpuTag = gpu => `<span class="gtag ${gcls(gpu)}">${esc(gpu)}</span>`;
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
// when free stock exists, otherwise it opens the market filtered to that GPU.
export function slotsHTML(g, card, { live = true, big = false } = {}) {
  const st = cardState(g, card), built = card.status === 'built', can = live && st.live;
  return `<div class="fc-slots ${big ? 'is-big' : ''} ${st.total > 8 ? 'is-dense' : ''}">${st.rows.map(r => {
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
  if (card.scenario) return scenarioWhat(card);
  if (card.moonshot !== undefined) { const p = moonshotOdds(g); return card.moonshot ? `${pct(p.legendary)} legendary · ${pct(p.setback)} setback` : 'Stage 1/2 · training follows integration'; }
  const odds = researchOdds(g, card);
  if (card.strategic) return `Due at this bell. ${card.mixed ? '75% integration delivers; otherwise one-round delay. ' : ''}${card.strategic.stage + 1 < card.strategic.total ? 'Next stage follows delivery; missing it ends the partnership.' : 'Final deployment; recurring customer revenue.'}`;
  if (card.lane === 'product') return `Bell income · +${pct(FOUNDER.growth)}/round`;
  if (card.lane === 'research') return `${pct(odds.breakthrough)} breakthrough · ${pct(odds.setback)} setback${odds.engineer ? ' · Mara' : ''}`;
  if (card.lane === 'infra') return 'Free GPUs at every round open';
  if (card.kind === 'partner') return 'Investors notice a published breakthrough';
  return 'One-off prize, paid when you build it';
}

// ---- A full card on the desktop board -------------------------------------------------------
export function cardTile(g, card, live = true) {
  const st = cardState(g, card), lane = laneOf(card), built = card.status === 'built', expired = card.status === 'expired' || (card.status === 'open' && !st.live && card.until);
  const now = g.arcade.time, b = built ? g.company.builds.find(x => x.card === card.id) : null;
  const head = `<header class="fc-head"><span class="fc-lane">${esc(laneLabel(card).toUpperCase())}${card.tier ? `<i> · T${card.tier}</i>` : ''}</span>${card.mixed ? '<span class="fc-mixed" title="Mixed GPUs: integration at the bell">MIXED</span>' : ''}${card.until && !built && !expired ? fuse(card.until, card.at, now) : ''}</header>`;
  const name = live && !built && st.live ? button('open-card', esc(card.name), `class="fc-name" data-card="${esc(card.id)}" aria-label="Open the ${esc(card.name)} card desk"`) : `<b class="fc-name">${esc(card.name)}</b>`;
  const change = b ? buildChange(g, b) : null;
  const foot = built ? `<footer class="fc-foot is-built"><span class="fc-result tone-${change.tone}"><b>${esc(change.head)}</b> ${esc(change.text)}</span></footer>`
    : expired ? `<footer class="fc-foot"><span class="fc-result">Window closed · GPUs released</span></footer>`
    : `<footer class="fc-foot"><span class="fc-count"><b>${st.held}</b>/${st.total} GPUs${st.missing ? `<small>NEED ${deficit(st)}</small>` : ''}</span>` +
      (live && st.live ? `${canFill(st) && !st.ready ? button('fill', 'Fill', `class="fc-fill" data-card="${esc(card.id)}" aria-label="Fill ${esc(card.name)} from free stock"`) : ''}${button('build', 'BUILD', `class="fc-build ${st.ready ? 'is-lit' : ''}" data-card="${esc(card.id)}" ${st.ready ? '' : 'disabled'} aria-label="${st.ready ? `Build ${esc(card.name)} now (irreversible)` : `Build ${esc(card.name)}: ${st.missing} GPUs missing`}"`)}` : '') + '</footer>';
  const stamp = built ? `<strong class="fc-stamp" aria-hidden="true">${card.lane === 'opportunity' ? 'WON' : 'BUILT'}</strong>` : expired ? '<strong class="fc-stamp is-expired" aria-hidden="true">EXPIRED</strong>' : '';
  return `<article class="fc lane-${lane} ${st.ready ? 'is-ready' : ''} ${built ? 'is-built' : ''} ${expired ? 'is-expired' : ''} ${card.mixed ? 'is-mixed' : ''} ${card.scenario ? `is-scenario scn-${esc(card.scenario.key)}` : ''}" data-card-id="${esc(card.id)}" aria-label="${esc(laneLabel(card))}: ${esc(card.name)}. ${esc(rewardLine(g, card))}. ${built ? 'Built.' : `${st.held} of ${st.total} GPUs reserved.`}">` +
    `${head}${name}<p class="fc-blurb">${esc(card.blurb || '')}</p><p class="fc-reward">${esc(rewardLine(g, card))}</p><p class="fc-what">${esc(card.strategic ? `Due this bell${card.mixed ? ' · 75% integration or 1-round delay' : ''}` : whatLine(card, g))}</p>${slotsHTML(g, card, { live })}${foot}${stamp}</article>`;
}

function emptyLane(g, lane) {
  if (lane === 'research' && g.world.institutional?.moonshot?.state.endsWith('-integrating')) return '<article class="fc lane-research is-empty"><header class="fc-head">FRONTIER RESEARCH</header><p class="fc-empty">Cluster integration pending at the bell. The commitment remains active.</p></article>';
  const text = lane === 'research' && g.company.level >= 5 ? `Model: ${MODEL_NAMES[5]}` : lane === 'research' ? 'Next run deals next round' : 'Next card deals next round';
  return `<article class="fc lane-${lane} is-empty" aria-label="${esc(text)}"><header class="fc-head"><span class="fc-lane">${lane === 'infra' ? 'INFRASTRUCTURE' : lane.toUpperCase()}</span></header><p class="fc-empty">${esc(text)}</p></article>`;
}
const emptyOpp = g => g.world.strategic?.state === 'waiting'
  ? `<article class="fc lane-opportunity is-empty"><header class="fc-head"><span class="fc-lane">PARTNERSHIP</span></header><p class="fc-empty">${esc(PARTNERSHIPS.find(p => p.id === g.world.strategic.id).name)}: integration delayed until this bell. The next stage opens after delivery.</p></article>`
  : '<article class="fc lane-opportunity is-empty is-quiet"><header class="fc-head"><span class="fc-lane">OPPORTUNITY</span></header><p class="fc-empty">No live opportunity. Pilots follow a product launch; rushes and partnerships arrive on their own.</p></article>';

// ---- The inventory tray: one stack per GPU ------------------------------------------------
export function tray(g, live = true) {
  return `<section class="tray" aria-label="Your GPUs">${GPUS.map(gpu => {
    const free = freeOf(g, gpu), res = reservedOf(g, gpu), rack = rackStock(g, gpu), pile = Math.min(6, free);
    const label = `${gpu}: ${free} free, ${res} reserved${rack ? `, ${rack} from your racks` : ''}. Find ${gpu} on the floor`;
    const inner = `<span class="stack-pile" aria-hidden="true">${Array.from({ length: Math.max(1, pile) }, (_, i) => gchip(gpu, free ? '' : 'is-ghost', i)).join('')}</span>` +
      `<span class="stack-copy"><span class="stack-name">${gpu}</span><b class="stack-free">${free}</b><small>free</small></span>` +
      `<span class="stack-meta">${res ? `<span class="stack-res">${res} reserved</span>` : ''}${rack ? `<span class="stack-rack">${rack} rack</span>` : ''}</span>`;
    return live ? button('open-market', inner, `class="stack ${gcls(gpu)} ${free ? '' : 'is-none'}" data-filter="supply" data-gpu="${gpu}" aria-label="${esc(label)}"`) : `<div class="stack ${gcls(gpu)} ${free ? '' : 'is-none'}" aria-hidden="true">${inner}</div>`;
  }).join('')}</section>`;
}

// Phones: one line of free counts above the card strip.
export function trayRow(g) {
  const chips = GPUS.map(gpu => { const free = freeOf(g, gpu); return `<span class="inv-chip ${gcls(gpu)} ${free ? '' : 'is-none'}">${gchip(gpu)}<b>${free}</b>${gpu}</span>`; }).join('');
  const res = GPUS.reduce((n, gpu) => n + reservedOf(g, gpu), 0);
  const due = g.company.compute.flatMap(k => k.tranches).filter(d => d.status === 'pending');
  return `<div class="inv-row" role="group" aria-label="Free GPUs: ${GPUS.map(gpu => `${freeOf(g, gpu)} ${gpu}`).join(', ')}; ${res} reserved"><span class="inv-tag">FREE</span>${chips}${res ? `<span class="inv-res">${res} held</span>` : ''}</div>` +
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
  return `<p class="assets"><span><i>Products</i> <b>${s.products}</b>${s.products ? ` · ${money(s.revenue)}/rd` : ''}</span><span><i>Model</i> <b>${esc(s.model)}</b></span><span><i>Racks</i> <b>${racks.length ? racks.map(([gpu, n]) => `+${n} ${gpu}`).join(' ') : 'none'}</b>${racks.length ? '/rd' : ''}</span></p>` +
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
  const st = cardState(g, card), built = card.status === 'built', expired = card.status === 'expired' || (card.status === 'open' && !st.live && card.until);
  const chips = st.rows.map(r => `<span class="fcc-resource ${gcls(r.gpu)}"><span>${r.gpu} <b>${built ? r.need : r.held}/${r.need}</b></span><span class="fcc-units" aria-hidden="true">${Array.from({ length: r.need }, (_, i) => `<i class="mini ${built || i < r.held ? 'is-filled' : ''}" data-slot="${esc(card.id)}|${r.gpu}|${i}"></i>`).join('')}</span></span>`).join('');
  const state = built ? `<span class="fcc-state is-built">${card.lane === 'opportunity' ? 'WON' : 'BUILT'}</span>` : expired ? '<span class="fcc-state is-expired">EXPIRED</span>' : st.ready ? '<span class="fcc-state is-ready">BUILD</span>' : `<span class="fcc-state"><b>${st.held}</b>/${st.total}</span>`;
  const inner = `<span class="fcc-lane">${esc(laneLabel(card).toUpperCase())}${card.mixed ? ' · MIXED' : ''}</span><b class="fcc-name">${esc(card.name)}</b><span class="fcc-reward">${esc(rewardLine(g, card))}</span><span class="fcc-foot"><span class="fcc-chips">${chips}</span>${state}</span>${!built && !expired && st.missing ? `<span class="fcc-deficit">NEED ${deficit(st)}</span>` : ''}${card.until && !built && !expired ? fuse(card.until, card.at, g.arcade.time) : ''}`;
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
export function cardDeskView(g, ui) {
  const card = g.arcade.objectives.find(o => o.id === ui.cardId);
  if (!card) return null;
  const st = cardState(g, card), built = card.status === 'built', lane = laneOf(card), now = g.arcade.time;
  const rivals = competesWith(g, card);
  const shared = rivals.map(o => `${esc(o.name)} (${Object.keys(o.recipe).filter(k => card.recipe[k]).join(', ')})`);
  const rows = st.rows.map(r => {
    const need = r.need - r.held;
    const find = need > 0 && !r.free ? button('open-market', `Find ${r.gpu}`, `class="mat-exit cd-find" data-filter="supply" data-gpu="${r.gpu}" aria-label="Find ${r.gpu} on the floor"`) : '';
    return `<p class="cd-row ${gcls(r.gpu)}"><span class="cd-gpu">${gpuTag(r.gpu)}</span><span class="cd-figs"><b>${r.held}/${r.need}</b> reserved · <b>${r.free}</b> free</span>${find}</p>`;
  }).join('');
  const body = `<div class="desk-center"><article class="card-desk mat-paper lane-${lane} ${st.ready ? 'is-ready' : ''}" data-card-id="${esc(card.id)}">` +
    `<header class="cd-head"><span>${esc(laneLabel(card).toUpperCase())}${card.tier ? ` · TIER ${card.tier}` : ''}</span>${card.mixed ? '<span class="fc-mixed">MIXED · integration at the bell</span>' : ''}${card.until && st.live ? fuse(card.until, card.at, now) : ''}</header>` +
    `<p class="cd-blurb">${esc(card.blurb || '')}</p><p class="cd-reward">${esc(rewardLine(g, card))}</p><p class="cd-what">${esc(whatLine(card, g))}</p>${partnershipTerms(g, card)}${scenarioCardTerms(g, card)}` +
    (card.cashCost ? `<p class="frontier-capital">BUILD spends ${money(card.cashCost)} cash plus these GPUs.${st.cashNeeded ? ` Need ${money(st.cashNeeded)} more cash.` : ''}</p>` : '') +
    `${slotsHTML(g, card, { live: !built, big: true })}<div class="cd-rows">${rows}</div>` +
    (shared.length ? `<p class="cd-compete"><span>Competes with</span> ${shared.join(' · ')}</p>` : '') +
    (st.held && st.live ? button('release', `Release all ${st.held}`, `class="mat-exit cd-release" data-card="${esc(card.id)}" data-all="1" aria-label="Release all ${st.held} reserved GPUs from ${esc(card.name)}"`) : '') +
    `</article></div>`;
  const missingGpu = st.rows.find(r => r.held < r.need && !r.free)?.gpu;
  const commit = !st.live ? '' : st.ready
    ? button('build', `<span class="vault-lock" aria-hidden="true"></span><b>BUILD</b><span class="vault-amt">${esc(rewardLine(g, card))}</span>`, `class="mat-vault rail-commit is-build" data-primary data-card="${esc(card.id)}" aria-label="Build ${esc(card.name)} now: irreversible"`)
    : canFill(st) ? button('fill', `<b>FILL FROM STOCK</b>`, `class="mat-vault rail-commit" data-primary data-card="${esc(card.id)}" aria-label="Fill ${esc(card.name)} from free stock"`)
    : missingGpu ? button('open-market', `Find ${missingGpu} <span aria-hidden="true">→</span>`, `class="mat-move rail-commit" data-primary data-filter="supply" data-gpu="${missingGpu}"`) : '';
  return { title: card.name, role: 'card', desk: 'card', exit: null,
    body, footer: button('close-focus', 'Back to the floor', 'class="mat-exit rail-quiet"') + (commit || `<span class="rail-fact">${st.cashNeeded ? `Need ${money(st.cashNeeded)} cash` : st.missing ? `${plural(st.missing, 'GPU')} missing` : ''}</span>`) };
}

// ---- The build moment ---------------------------------------------------------------------
export function builtView(g, ui = {}) {
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
