// V10.13 The World Gets Bigger: the Deal Room and the scenario surfaces. Everything here reads
// engine state (scenarios.js) and existing ledgers; the only controls are the Deal Room's options,
// the status chip that opens it, and a contract stage's paid extension on its card desk.
import { esc } from '../util.js';
import { liveOffers, scenarioOptions, reviewedOffer, anchorExclusive, markOf } from '../tycoon/scenarios.js';
import { CAST } from '../tycoon/scenario-content.js';
import { FOUNDER, GPUS, MODEL_NAMES, concentration, founderPct, cardState, enterpriseValue } from '../tycoon/founder.js';
import { money, short, pctOf } from './pit-ledger.js';

const button = (action, inner, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${inner}</button>`;
const recipe = r => GPUS.filter(k => r?.[k]).map(k => `${r[k]} ${k}`).join(' + ');
const seal = org => esc(String(org || 'HSC').split(/\s+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join('').slice(0, 2) || 'HS');
const castOf = o => CAST[o.cast] || { org: o.castOrg || 'A counterparty', who: o.castName || o.castOrg || 'Counterparty', role: 'Counterparty' };
const pp = x => `${Math.round(x * 100)}pp`;

// ---- Status: open proposals, live commitments, the risks you are carrying ------------------------------
export function scenarioChips(g, live = true) {
  const s = g.world.scen; if (!s) return [];
  const chips = [];
  for (const o of liveOffers(g)) {
    const c = castOf(o), label = `${o.major ? 'PRIVATE OFFER' : 'OFFER'} · ${c.org}`;
    chips.push(live ? button('review-scenario', `<i class="scn-seal" aria-hidden="true">${seal(c.org)}</i><span>${esc(label)}</span>`, `class="scn-chip is-offer ${o.major ? 'is-major' : ''}" data-id="${esc(o.id)}" aria-label="${esc(`${label}: ${o.title}. Open the Deal Room`)}"`)
      : `<span class="scn-chip is-offer ${o.major ? 'is-major' : ''}"><i class="scn-seal" aria-hidden="true">${seal(c.org)}</i><span>${esc(label)}</span></span>`);
  }
  for (const ch of s.chains.filter(ch => ['active', 'waiting'].includes(ch.state) && ch.stages.length > 1)) {
    const next = ch.state === 'waiting' ? 'integrating · counts next bell' : ch.due === g.q && g.phase === 'floor' ? 'due this bell' : `next due R${ch.due}`;
    chips.push(`<span class="scn-chip is-chain ${ch.due === g.q && ch.state === 'active' ? 'is-due' : ''}">${esc(ch.org)} ${ch.stage}/${ch.stages.length} · ${esc(next)}${ch.key === 'anchor' && s.anchor?.exclusive ? ' · exclusive' : ''}</span>`);
  }
  const x = concentration(g.company);
  if (x.share >= .3) chips.push(`<span class="scn-chip is-risk" title="A customer this large can hurt you">Concentration ${Math.round(x.share * 100)}% · ${esc(x.customer)}</span>`);
  const t = g.company.mods?.tech;
  if (t && g.company.level < t.until) chips.push(`<span class="scn-chip is-risk">Lantern-70: model value −${Math.round((1 - t.mult) * 100)}% until ${esc(MODEL_NAMES[t.until])}</span>`);
  if (s.bonus && !s.bonus.used) chips.push(`<span class="scn-chip is-good">Talent: +${pp(s.bonus.breakthrough)} next run${s.bonus.legendary ? ` · +${pp(s.bonus.legendary)} legendary` : ''}</span>`);
  if (g.company.researchClosed) chips.push('<span class="scn-chip">Lab closed · inference company</span>');
  return chips;
}
export function scenarioStatus(g, live = true) {
  const chips = scenarioChips(g, live);
  return chips.length ? `<p class="scn-status" role="group" aria-label="Deals and commitments">${chips.join('')}</p>` : '';
}
// The tape's private-offer flag (desktop room).
export function tapeOffer(g, live = true) {
  const o = liveOffers(g)[0]; if (!o) return '';
  const c = castOf(o), inner = `<i class="tape-news">${o.major ? 'PRIVATE' : 'OFFER'}</i><span>${esc(String(c.org).split(' ')[0])}</span>`;
  return live ? button('review-scenario', inner, `class="tape-deal ${o.major ? 'is-major' : ''}" data-id="${esc(o.id)}" aria-label="${esc(`Open the Deal Room: ${o.title}`)}"`) : `<span class="tape-deal">${inner}</span>`;
}

// ---- The Deal Room ------------------------------------------------------------------------------------------
function anchorTerms(g, o) {
  const t = o.terms, rows = t.schedule.map(x => `<tr><th scope="row">R${x.round}</th><td>${esc(x.name)}</td><td>${esc(recipe(x.recipe))}</td><td>+${short(x.open)}</td><td>+${short(x.exclusive)}</td></tr>`).join('');
  return `<table class="dr-schedule"><caption>Delivery schedule · each region due at its bell</caption><thead><tr><th>Bell</th><th>Region</th><th>GPUs</th><th>Open</th><th>Exclusive</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p class="dr-fine">Revenue is base per round, before model quality. Contract revenue is valued at ${Math.round(FOUNDER.contractMultiple * 100)}% of the product multiple: big cash, smaller exit value. One paid extension per contract.</p>`;
}
function buyoutTerms(g, o) {
  const t = o.terms, pct = founderPct(g.company), mark = markOf(g);
  return `<div class="dr-price"><p><span>Price for 100%</span><strong class="money-hero">${short(t.price)}</strong>${t.price !== t.opening ? `<small>was ${short(t.opening)}</small>` : ''}</p>` +
    `<p><span>Your ${pctOf(pct)}</span><strong class="money-hero win">${short(Math.floor(pct * t.price))}</strong><small>paid now</small></p>` +
    `<p><span>Today’s mark</span><strong>${short(mark)}</strong><small>${(t.price / Math.max(1, mark)).toFixed(1)}× · cash ${short(Math.round(g.cash * 100))} + EV ${short(enterpriseValue(g.company))}</small></p></div>`;
}
function parallaxTerms(g, o) {
  const t = o.terms, r = n => `$${(n / 100).toFixed(2)}`;
  return `<dl class="dr-figs"><div><dt>Their bid</dt><dd>${t.qty} B200 at ${r(t.open)}/h, room to ${r(t.ceiling)}/h</dd></div><div><dt>Joint cluster</dt><dd>${esc(recipe(t.jv.recipe))} by the bell · paid ${short(t.jv.cash)}</dd></div></dl>`;
}
const TERMS = { anchor: anchorTerms, buyout: buyoutTerms, parallax: parallaxTerms };

export function scenarioView(g) {
  const o = reviewedOffer(g); if (!o) return null;
  const c = castOf(o), opts = scenarioOptions(g, o), live = o.state === 'open';
  const last = o.log?.at(-1), now = g.arcade.time;
  const fuse = o.until < g.arcade.seconds ? `<span class="desk-fuse ${o.until - now < 8 ? 'is-short' : ''}" data-fuse style="--left:${Math.min(1, Math.max(0, (o.until - now) / Math.max(1, o.until - o.at))).toFixed(3)}"><b data-station-until="${o.until}" data-station-at="${o.at}">${Math.ceil(Math.max(0, o.until - now))}s</b></span>` : '<span>Open until the bell</span>';
  const opt = x => button('choose-scenario', `<b>${esc(x.label)}</b><small>${esc(x.enabled ? x.note : x.reason || x.note)}</small>`,
    `class="dr-opt ${x.primary ? 'is-primary' : ''} ${x.decline ? 'is-decline' : ''} ${x.enabled ? '' : 'is-off'}" data-option="${esc(x.id)}" ${x.enabled ? '' : 'disabled'} ${x.primary && x.enabled ? 'data-autofocus' : ''}`);
  const body = `<div class="desk-center"><article class="paper-sheet mat-paper deal-room deal-${esc(o.key)} ${o.major ? 'is-major' : ''}" data-fx-contract>` +
    `<header class="contract-head"><span>${esc(o.kicker || 'PRIVATE')}</span>${fuse}</header>` +
    `<div class="dr-top"><strong class="dr-seal" aria-hidden="true">${seal(c.org)}</strong><div><h3 class="dr-title">${esc(o.title)}</h3><p class="dr-premise">${esc(o.premise || '')}</p></div></div>` +
    (TERMS[o.key]?.(g, o) || '') +
    (last ? `<p class="dr-reply"><b>${esc(last.speaker)}:</b> “${esc(last.text)}”</p>` : '') +
    (live ? `<div class="dr-options" role="group" aria-label="Your decision">${opts.map(opt).join('')}</div>` : '<p class="dr-fine">This offer is closed.</p>') +
    `<p class="dr-fine">Every number above is binding as shown. The floor is paused while you read.</p></article></div>`;
  return { title: 'The Deal Room', role: 'capital', desk: 'deal-room', tone: 'negotiation',
    identity: { name: c.who, role: o.cast === 'parallax' ? 'startup' : 'capital', tag: (c.org || '').toUpperCase(), subtitle: c.role, line: last?.text || o.line || '', reaction: o.kicker?.split('·').at(-1)?.trim() || '', mood: o.key === 'crisis' || o.suitor === 'lastlight' ? 'annoyed' : 'eager' },
    exit: { action: 'close-focus', label: 'Decide later', aria: 'Decide later: the offer stays open on your status strip' }, body,
    footer: button('close-focus', 'Decide later', 'class="mat-exit rail-quiet"') + `<span class="rail-fact">${live ? `${opts.filter(x => x.enabled).length} options` : 'Closed'}</span>` };
}

// ---- A commitment card's terms (card desk) --------------------------------------------------------------------
export function scenarioCardTerms(g, card) {
  const sc = card.scenario; if (!sc) return '';
  const ch = g.world.scen.chains.find(x => x.id === sc.chain); if (!ch) return '';
  const rows = ch.stages.map((st, i) => `<li class="${i < ch.stage ? 'is-done' : i === ch.stage ? 'is-now' : ''}"><b>${i < ch.stage ? '✓' : i === ch.stage ? '→' : '·'} ${esc(st.name)}</b><span>${esc(recipe(st.recipe))}${st.reward?.revenue ? ` · +${short(st.reward.revenue)}/round` : st.reward?.cash ? ` · ${short(st.reward.cash)} paid` : st.reward?.rack ? ` · +${st.reward.rack.qty} ${st.reward.rack.gpu}/round` : ''}${i > ch.stage ? ` · R${ch.due + i - ch.stage}` : ''}</span></li>`).join('');
  const miss = sc.penalty ? `Miss this bell: ${sc.terminates ? 'the contract ends, its revenue stops, and ' : ''}${short(sc.penalty)} in damages after payroll.` : 'Miss it and the opportunity lapses; nothing else is owed.';
  const st = cardState(g, card), cash = Math.round(g.cash * 100);
  const lastDue = g.q + (ch.stages.length - ch.stage);
  const cure = sc.cure && !ch.cureUsed && card.status === 'open' && st.live ? (lastDue <= 10 ? button('cure-stage', `Request a one-round extension · ${short(sc.cure)}`, `class="mat-exit scn-cure" data-card="${esc(card.id)}" ${cash >= sc.cure ? '' : 'disabled'} aria-label="Pay ${money(sc.cure)} to move this stage to next round"`) : '<p class="dr-fine">No extension: the last stage would fall after round 10.</p>') : '';
  return `<section class="scn-terms">${ch.stages.length > 1 ? `<ol class="scn-stages">${rows}</ol>` : ''}<p class="scn-miss ${sc.penalty ? 'is-penalty' : ''}">${esc(miss)}</p>${sc.contract ? `<p class="dr-fine">Dedicated contract revenue: valued at ${Math.round(FOUNDER.contractMultiple * 100)}% of the product multiple at the exit.</p>` : ''}${cure}</section>`;
}
export const scenarioWhat = card => {
  const sc = card.scenario;
  return sc.penalty ? `Due this bell · miss −${short(sc.penalty)}` : card.until < 45 ? 'Short window' : 'Due this bell';
};

// ---- Before the bell and on the board update --------------------------------------------------------------------
export function scenarioBellLines(g) {
  return g.arcade.objectives.filter(o => o.kind === 'scenario' && o.status === 'open' && o.scenario?.penalty).map(o => {
    const st = cardState(g, o);
    return `<li class="lane-opportunity ${st.ready ? '' : 'is-warning'}"><b>${esc(o.name)}</b><span>${st.ready ? 'ready: BUILD it before the bell' : `${st.held}/${st.total} reserved · MISS: ${o.scenario.terminates ? 'terminated, ' : ''}−${short(o.scenario.penalty)}`}</span></li>`;
  }).join('');
}
export function scenarioReportLines(r) {
  const s = r.scenario; if (!s || !s.dues) return '';
  return `<p class="bu-expired scn-dues"><span>Damages</span><b>−${money(s.paid)}</b>${s.carried ? `<small>${money(s.carried)} unpaid: added to next round’s burn</small>` : `<small>${esc((s.lines || []).join(' · '))}</small>`}</p>`;
}
// The choices that shaped the company, for the exit sheet.
const CHOICE_TEXT = {
  anchor: { exclusive: 'Signed Cirrostrata exclusive', open: 'Signed the Cirrostrata contract', pass: 'Passed on Cirrostrata' },
  parallax: { sell: 'Sold B200s to Parallax at 3 a.m.', jv: 'Co-trained with Parallax', refuse: 'Let Parallax burn' },
  firesale: { hall: 'Bought Parallax’s data hall', team: 'Hired Juno Sterling’s team', pass: 'Passed on the fire sale' },
  buyout: { sell: 'Sold the company', decline: 'Turned down a buyout' },
  lantern: { serve: 'Served Lantern-70', team: 'Hired the Lantern team', ignore: 'Stayed proprietary' },
  crisis: { discount: 'Kept a customer at a discount', redeploy: 'Redeployed a lost customer’s capacity', enforce: 'Enforced a customer contract' },
  capacity: { forward: 'Sold next round’s compute forward', sell: 'Sold B200s to Tessellate', keep: 'Kept the capacity' },
  talent: { match: 'Matched Parallax for Mara Vale', equity: 'Paid talent in equity', release: 'Let Mara Vale go', cash: 'Hired the Okafor team', pass: 'Passed on the Okafor team' },
  provider: { full: 'Closed the lab for a dedicated contract', small: 'Took a dedicated inference deal', decline: 'Stayed a lab' },
  checkpoint: { rescue: 'Ran the Polyglot migration rescue', mirror: 'Hosted the Polyglot mirror', clean: 'Retrained Polyglot clean', pass: 'Stayed out of the Polyglot outage' },
};
export function scenarioChoices(g) {
  return (g.world.scen?.offers || []).filter(o => o.choice && CHOICE_TEXT[o.key]?.[o.choice]).map(o => ({ q: o.q, text: o.key === 'buyout' && o.choice === 'sell' ? `Sold to ${castOf(o).org} for ${short(o.terms.price)}` : CHOICE_TEXT[o.key][o.choice] }));
}
