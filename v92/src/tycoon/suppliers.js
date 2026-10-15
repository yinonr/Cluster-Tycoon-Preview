// V6.3: firm-stable tendencies; cluster descriptions and projections use existing facts only.
import { stream, int, esc, usd, round2 } from '../util.js';
import { defaultTermFor } from '../modes/wants.js';
import { buyerLive, askOf, sellable, ledger, servesOrder, money, ECON } from '../modes/economy.js';
import { badge, fitTag, fitOf, GPU_ID } from './gpu.js';
import { TERM_ADJ } from '../data/gpus.js';

export const supplierVersion = (game) => [63, 64].includes(game?.supplierVersion);
export const inventoryVersion = (game) => game?.supplierVersion === 64;
const PROFILES = [
  { id: 'tenant', name: 'Long-term operator', want: 'certainty', tip: 'A longer commitment can move the quote; unused months still cost you.' },
  { id: 'straight', name: 'Straight-number operator', want: 'respect', tip: 'A serious opener earns room; a lowball can harden the price.' },
  { id: 'clearer', name: 'Capacity clearer', want: 'hungry', tip: 'A bold opening can unlock negotiation room; a cheap quote is not guaranteed.' },
];
const INVENTORY = {
  tenant: { name: 'Long-term infrastructure operator', tendency: 'Usually 12/24-month supply, larger minimums and lower hourly quotes; unused months still cost you.' },
  straight: { name: 'Flexible capacity aggregator', tendency: 'Usually small divisible minimums, near-term delivery and shorter choices; flexibility can cost more per GPU.' },
  clearer: { name: 'Surplus capacity operator', tendency: 'Usually whole blocks and lower quotes, with varying terms or delayed delivery; cheap supply needs a buyer.' },
};
export function supplierOf(game, lot) {
  const style = PROFILES[stream(63, 'supplier-personality', lot.firm).int(0, PROFILES.length - 1)];
  const profile = inventoryVersion(game) ? { ...style, ...INVENTORY[style.id] } : style;
  if (lot.archetype === 'distressed') return { ...profile, want: 'desperate', tip: 'This block is in wind-down: liquidation overrides their usual style. Quantity and term exposure remain.' };
  return profile;
}

// Transform existing supply, including later releases, before the UI sees it. Same firms,
// GPUs and finite total stock. Independent draws; a special release can break the tendency.
// Auctions and real wind-down inventory keep their original commercial constraints.
export function installSupplierInventory(run, game, Q) {
  if (!inventoryVersion(game)) return;
  const apply = (lot) => {
    if (!lot.sellerId || lot.supplierInventory || lot.archetype === 'distressed' || lot.archetype === 'called') return;
    const p = supplierOf(game, lot), r = stream(game.seed, 'supplier-inventory', game.q, lot.firm, lot.id);
    lot.supplierInventory = r.next() < 0.8 ? 'typical' : 'special';
    if (lot.supplierInventory === 'special') return;
    const room = lot.ask - lot.floor;
    let bias;
    if (p.id === 'tenant') {
      lot.terms = r.next() < 0.7 ? [12, 24] : [24]; lot.baseTerm = 24;
      lot.divisible = r.next() < 0.4;
      lot.step = lot.qty / 4; lot.minQty = lot.divisible ? lot.qty / 2 : lot.qty;
      lot.delivery = r.pick([7, 21, 45]); bias = -0.09;
    } else if (p.id === 'straight') {
      lot.terms = r.next() < 0.7 ? [6, 12] : [6, 12, 24]; lot.baseTerm = 12;
      lot.divisible = true; lot.step = Math.min(Q / 8, lot.qty); lot.minQty = lot.step;
      lot.delivery = r.pick([0, 7, 14]); bias = -0.03;
    } else {
      lot.terms = r.pick([[6, 12], [12, 24], [24]]); lot.baseTerm = lot.terms.includes(12) ? 12 : 24;
      lot.divisible = r.next() < 0.2;
      lot.step = lot.qty / 4; lot.minQty = lot.divisible ? lot.qty / 2 : lot.qty;
      lot.delivery = r.pick([14, 30, 45, 60]); bias = -0.12;
    }
    if (lot.archetype === 'frontier') lot.terms = lot.terms.filter(t => t >= 12);
    // Rebase the quote when changing baseTerm: don't accidentally grant a second term discount.
    // Quote against today's board, not the former desk's discount: a delayed bargain
    // becoming ready capacity must not retain a discount for a catch it no longer has.
    lot.ask = round2(Math.max(0.2, run.market.bench[lot.gpu] + TERM_ADJ[lot.baseTerm] + bias + r.range(-0.10, 0.10)));
    lot.floor = round2(Math.max(0.1, lot.ask - room));
    lot.deliveryLabel = lot.delivery ? `${lot.delivery} DAYS` : 'TODAY';
    lot.labWant = null;
  };
  run.market.lots.forEach(apply);
  run.market.on('lot:added', apply);
}
export function supplierWant(run, lot) {
  const p = supplierOf(run.tycoon, lot);
  if (p.want === 'certainty' && Math.max(...lot.terms) <= defaultTermFor(run, lot)) return 'none';
  return p.want;
}
export function clusterOf(run, lot) {
  const tags = [lot.delivery > 30 ? 'FORWARD CAPACITY' : lot.delivery <= 14 ? 'READY SOON' : 'SCHEDULED CAPACITY',
    lot.divisible ? `FLEXIBLE · MIN ${int(lot.minQty)}` : `WHOLE BLOCK · ${int(lot.qty)}`];
  const gap = round2(run.market.askAt(lot, 12) - run.market.bench[lot.gpu]);
  const reference = lot.terms.includes(12) ? 'at 12M' : 'on a 12M-equivalent reference';
  const price = `${Math.abs(Math.round(gap * 100))}¢ ${gap < 0 ? 'under' : 'over'} board ${reference}`;
  const catchText = lot.delivery > 30 ? `${lot.delivery}d delivery misses a 30d buyer.` : lot.divisible ? `Buy in ${int(lot.step)}-GPU steps; the minimum is ${int(lot.minQty)}.` : `All ${int(lot.qty)} GPUs must be bought together.`;
  return { tags, price: gap === 0 ? `At board ${reference}` : price, catchText };
}

// Quantity, duration, delivery and customer allocation are checked before quoting spare margin.
export function lotOpportunities(run, lot, spec, eff) {
  const alloc = run.resaleLotId === lot.id ? 0 : servesOrder(run.mandate, { ...lot, ...spec }) ? Math.min(spec.qty, Math.max(0, run.mandate.qty - ledger(run).filled)) : 0;
  const spare = spec.qty - alloc;
  const legalQty = Number.isSafeInteger(spec.qty) && spec.qty > 0 && spec.qty <= lot.qty && (lot.divisible ? spec.qty >= lot.minQty && Number.isInteger((spec.qty - lot.minQty) / lot.step) : spec.qty === lot.qty);
  return (run.labBuyers || []).filter(buyerLive).map((b) => {
    const fits = legalQty && lot.terms.includes(spec.term) && lot.gpu === b.gpu && spec.term >= b.minTerm && lot.delivery <= b.delivery;
    const qty = fits ? Math.min(spare, Math.max(0, b.qty - sellable(run, b))) : 0;
    const price = askOf(b), spread = price - eff;
    const net = qty * spread * spec.term * ECON.hours - (spare - qty) * Math.min(eff, ECON.sublet) * spec.term * ECON.hours;
    const why = !legalQty ? 'Quantity violates this seller’s block rules' : !lot.terms.includes(spec.term) ? 'This term is not offered by the supplier' : lot.gpu !== b.gpu ? `Needs ${b.gpu}, not ${lot.gpu}` : spec.term < b.minTerm ? `Needs ${b.minTerm}+ months` : lot.delivery > b.delivery ? `Needs delivery by ${b.delivery}d` : !spare ? `Client takes ${int(alloc)} first; no resale spare` : !qty ? 'Existing inventory already covers this request' : '';
    return { b, fits, qty, alloc, spare, spread, net, why, premium: round2(price - run.market.bench[b.gpu]) };
  }).sort((a, b) => Number(b.fits) - Number(a.fits) || b.qty - a.qty).slice(0, 3);
}
export function supplierPulse(run, lot) {
  if (!supplierVersion(run.tycoon)) return '';
  const p = supplierOf(run.tycoon, lot), c = clusterOf(run, lot);
  return `<span class="pr-profile"><b>${esc(lot.firm)}</b> · ${esc(p.name)} · ${esc(c.tags[1])}${lot.labFirstCall ? ' · FIRST CALL' : ''}</span>`;
}
export function lotInsight(run, lot, spec, eff) {
  if (!supplierVersion(run.tycoon)) return '';
  const p = supplierOf(run.tycoon, lot), c = clusterOf(run, lot), f = run.tycoon.firms[lot.firm];
  const tip = supplierWant(run, lot) === 'none' ? 'No extra tenant incentive on this lot; compare ordinary term quotes and negotiate the price.' : p.tip;
  const trust = lot.labFirstCall ? 'FIRST CALL ACTIVE · this opening block is held from rivals; more negotiation room, no guaranteed margin.' : f ? `${int(f.deals)} prior supplier deals · trust ${f.trust}.${f.trust >= 2 ? ' First call applies to opening blocks; this later lot has no hold.' : ' Trust 2 unlocks first call on an opening block.'}` : 'New supplier relationship. Two honored signings earn first call on an opening block.';
  const rows = lotOpportunities(run, lot, spec, eff);
  return `<div class="lot-insight"><p class="small"><b>${badge(lot.gpu)} ${esc(GPU_ID[lot.gpu]?.role || lot.gpu)}</b> · ${esc(c.tags[0])} · ${esc(c.price)}</p>
    <details><summary>${esc(p.name)}${lot.labFirstCall ? ' · FIRST CALL' : ''} · buyer fit & trade-offs</summary>
    ${p.tendency ? `<p class="small"><b>USUAL SUPPLY</b> · ${esc(p.tendency)} ${lot.supplierInventory === 'special' ? 'Special release today; read this block’s actual terms.' : ''}</p>` : ''}
    <p><b>${esc(p.name)}</b> · ${esc(tip)}</p><p class="small">${esc(trust)}</p>
    <p class="ui">${esc(c.tags.join(' · '))}</p>
    <p class="small">${esc(c.price)}. Catch: ${esc(c.catchText)} Terms ${lot.terms.join('/')} months; excess months and inventory remain exposure.</p>
    <div class="ui">CURRENT BUYER FIT · ${usd(eff)}/HR SUPPLY, FINANCING INCLUDED</div>
    ${rows.length ? rows.map((x) => `<p class="small"><b>${esc(x.b.firm)}</b> · ${badge(x.b.gpu)} ${fitTag(x.b.gpu !== lot.gpu ? 'wrong' : fitOf(x.b.work || 'serve', lot.gpu, run.market.bench))}<br>${x.why ? esc(x.why) : `${int(x.qty)} proposed spares · ${usd(askOf(x.b))}/hr bid (${x.premium >= 0 ? '+' : ''}${Math.round(x.premium * 100)}¢ vs board). Spread ${x.spread >= 0 ? '+' : ''}${Math.round(x.spread * 100)}¢/hr; spare margin ${money(x.net)} after unsold sublet exposure.`}</p>`).join('') : '<p class="small">No buyers on the floor yet. Cheap compute alone does not create demand.</p>'}
    <p class="small">Live unsigned requests can change or leave. Projections use this quantity and term; future holding costs are extra.</p></details></div>`;
}
