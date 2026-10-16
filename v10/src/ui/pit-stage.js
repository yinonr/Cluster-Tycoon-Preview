// The trading pit is a view of actual engine counterparties. Presentation choices
// never reserve capacity, sort by margin, or change the finite market.
import { figureSVG } from './character.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cents, owned, remaining, V7 } from '../tycoon/arcade.js';
import { buyerLive } from '../tycoon/arcade-buyers.js';
import { vcLive } from '../tycoon/arcade-vc.js';

const money = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(c / 100);
const faceOf = name => [...String(name || 'HSC')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
const rate = n => `$${(n / 100).toFixed(2)}`;
const gpu = name => `<span class="pit-gpu pit-gpu-${esc(name.toLowerCase())}">${esc(name)}</span>`;
const button = (action, text, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${text}</button>`;
const buyerQty = b => Math.max(0, Math.min(b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))));

function person(role, name) {
  const i = faceOf(name), founder = role === 'startup';
  return figureSVG({ badge: founder ? 'FOUNDER' : role === 'seller' ? 'SUPPLY' : role === 'buyer' ? 'BUYER' : 'HSC', look: {
    skin: ['#DDA67C', '#BC8059', '#875038', '#E9BA96'][i % 4],
    hair: ['#30241C', '#5B372A', '#B0A393', '#171C21'][Math.floor(i / 5) % 4],
    hairStyle: ['slick', 'bob', 'curly', 'short', 'bighair', 'bald'][Math.floor(i / 11) % 6],
    suit: founder ? '#B77543' : role === 'seller' ? ['#486957', '#3C625F', '#67714D'][Math.floor(i / 17) % 3] : role === 'buyer' ? ['#6D4E68', '#765344', '#4C5A73'][Math.floor(i / 17) % 3] : '#465B70',
    shirt: '#F4EBD6', tie: ['#B6472C', '#C7A44E', '#284C58'][i % 3], glasses: !!(i % 2), phone: role === 'seller'
  } });
}

function market(g, ui = {}) {
  const lots = g.arcade.lots.filter(l => available(g, l));
  const buyers = g.arcade.buyers.filter(b => buyerLive(g, b));
  const remembered = buyers.find(b => b.id === g.arcade.sourcingFor?.buyerId || b.id === g.arcade.sourcingFor || b.id === ui.buyerId);
  // Engine order is deliberate. This cue reveals relevance, never the best spread.
  const primaryBuyer = buyers.find(b => owned(g, b.gpu) > 0) || remembered || buyers[0];
  const relevantGPU = ui.gpu || primaryBuyer?.gpu;
  const firstSupplier = lots.find(l => l.gpu === relevantGPU) || lots[0];
  const pick = (items, first) => first ? [first, ...items.filter(x => x !== first)].slice(0, 2) : [];
  return { lots, buyers, primaryBuyer, relevantGPU, suppliers: pick(lots, firstSupplier), customers: pick(buyers, primaryBuyer) };
}

function station(g, item, role, index, relevantGPU, primaryId) {
  const seller = role === 'seller', name = seller ? item.firm : item.name;
  const qty = seller ? item.qty : buyerQty(item), price = seller ? item.negotiation?.price ?? item.ask : item.rate;
  const primary = item.id === primaryId, relevant = item.gpu === relevantGPU;
  return `<button type="button" class="pit-station ${role} station-${index} ${primary ? 'is-primary' : relevant ? 'is-relevant' : ''}" data-action="${seller ? 'focus-supplier' : 'focus-buyer'}" data-id="${esc(item.id)}" data-slot="${role}-${item.slot}" aria-label="${seller ? 'Supplier' : 'Buyer'} ${esc(name)}, ${qty} ${esc(item.gpu)}, ${money(cents(qty, price))} ${seller ? 'total cost' : 'funded payout'}">
    <span class="pit-station-call">${primary ? 'A BUYER TO MEET' : seller ? 'SUPPLIER' : 'FUNDED BUYER'}</span>
    <span class="pit-station-person" aria-hidden="true">${person(role, name)}</span>
    <span class="pit-crt"><span class="pit-crt-top">${qty} ${gpu(item.gpu)} <i aria-hidden="true"></i></span><strong>${money(cents(qty, price))}</strong><small>${seller ? 'LOT COST' : 'FUNDED PAYOUT'} · ${rate(price)}/h</small></span>
    <span class="pit-station-desk" aria-hidden="true"><i></i></span>
    <span class="pit-station-plaque"><b>${esc(name)}</b><span>${seller ? 'Negotiate supply' : 'Meet the buyer'} <i aria-hidden="true">→</i></span></span>
  </button>`;
}

export function stage(g, ui = {}) {
  const a = g.arcade, m = market(g, ui), anchor = a.orders.find(o => o.client === a.anchor) || a.orders[0];
  const vc = a.vcOffers.find(v => vcLive(g, v)), stock = a.inventory.reduce((n, x) => n + x.left, 0);
  const upcoming = [...a.lots, ...a.buyers].filter(x => x.at > a.time).sort((x, y) => x.at - y.at)[0];
  const primary = m.primaryBuyer, primaryQty = primary && buyerQty(primary);
  const badNotice = a.message?.tone === 'bad' && !a.active && !a.confirm ? a.message.text : null;
  const cue = primary ? owned(g, primary.gpu) ? `${owned(g, primary.gpu)} ${primary.gpu} in your book. Find your sale.` : `${primary.name} needs ${primaryQty} ${primary.gpu}. Work the room.` : m.lots.length ? 'Supply is on the floor. Find your next deal.' : upcoming ? `New quotes arrive in ${Math.ceil(upcoming.at - a.time)} seconds.` : 'The market is quiet. Review your book or close the round.';
  const move = primary ? button('focus-buyer', `Meet the buyer <span aria-hidden="true">→</span>`, `data-id="${esc(primary.id)}" class="pit-main-move"`) : m.suppliers[0] ? button('focus-supplier', 'Inspect supply →', `data-id="${esc(m.suppliers[0].id)}" class="pit-main-move"`) : button('open-panel', 'Review your book →', 'data-panel="stock" class="pit-main-move"');
  const desks = [m.suppliers[0] && station(g, m.suppliers[0], 'seller', 0, m.relevantGPU, primary?.id), m.customers[0] && station(g, m.customers[0], 'buyer', 1, m.relevantGPU, primary?.id), m.suppliers[1] && station(g, m.suppliers[1], 'seller', 2, m.relevantGPU, primary?.id), m.customers[1] && station(g, m.customers[1], 'buyer', 3, m.relevantGPU, primary?.id)].filter(Boolean).join('');
  return `<section class="pit-stage ${badNotice ? 'has-notice' : ''}" aria-label="Haight Street Compute trading floor">
    <header class="pit-hud ${cash(g) >= 10000000 ? 'has-large-cash' : ''}"><div class="pit-hud-brand"><b>HSC</b><span>THE TRADING PIT</span></div><div class="pit-cash"><span>CASH AVAILABLE</span><strong>${money(cash(g))}</strong></div><div class="pit-round"><span>ROUND</span><strong>${g.q}<small> / ${V7.rounds}</small></strong></div><div class="pit-clock"><span>FLOOR TIME</span><strong data-floor-clock>${Math.max(0, Math.ceil(V7.seconds - a.time))}s</strong></div>${button('sound', `<span aria-hidden="true">${ui.sound ? '♫' : '♪'}</span>`, `class="pit-sound ${ui.sound ? 'is-on' : ''}" aria-label="Sound ${ui.sound ? 'on; turn off' : 'off; turn on'}" aria-pressed="${!!ui.sound}" title="Sound ${ui.sound ? 'on' : 'off'}"`)}</header>
    <div class="pit-hall">
      <div class="pit-architecture" aria-hidden="true"><div class="pit-coffer"></div><div class="pit-column column-left"></div><div class="pit-column column-right"></div><div class="pit-marble"></div><div class="pit-balustrade"></div></div>
      <div class="pit-house-sign"><span>THE COMPUTE EXCHANGE</span><h1>HAIGHT STREET<strong>COMPUTE</strong></h1><small>SAN FRANCISCO · MEMBERS’ FLOOR</small></div>
      <div class="pit-market-board"><span>LIVE ON THE FLOOR</span><b><i>${m.lots.length}</i> SUPPLIERS <em>·</em> <i>${m.buyers.length}</i> BUYERS</b><small>FINITE LOTS. REAL DEALS.</small></div>
      ${anchor ? `<button type="button" class="pit-founder ${owned(g, anchor.gpu) && remaining(anchor) ? 'has-stock' : ''}" data-action="focus-anchor" aria-label="Visit your anchor startup ${esc(anchor.name)}"><span class="pit-founder-label">YOUR STARTUP</span><span class="pit-founder-person" aria-hidden="true">${person('startup', anchor.name)}</span><span class="pit-founder-name">${esc(anchor.name)}</span><span class="pit-founder-need">${remaining(anchor) ? `${remaining(anchor)} ${esc(anchor.gpu)} needed` : 'ORDER COMPLETE'}</span><span class="pit-founder-link">Meet founder →</span></button>` : ''}
      <div class="pit-upper-doors">${button('open-panel', `<span>CAPITAL OFFICE</span><b>${vc ? 'Funded bid →' : 'Secondary shares →'}</b>`, 'data-panel="capital" class="pit-office"')}${a.mandate || a.mandateCompleted ? button('open-panel', `<span>BLOCK TRADES</span><b>Atlas ${a.mandateCompleted ? 'complete' : a.time >= a.mandate.until ? 'closed' : 'procurement'} →</b>`, 'data-panel="mandate" class="pit-office pit-atlas"') : ''}</div>
      <div class="pit-center" aria-hidden="true"><div class="pit-center-inset"><span>HAIGHT STREET COMPUTE</span><b>HSC</b><small>THE TRADING PIT</small></div></div>
      <div class="pit-stations" aria-label="Selected live counterparties">${desks}</div>
      ${button('open-market', `<span>THE WHOLE MARKET</span><strong>${m.lots.length + m.buyers.length} live opportunities <i aria-hidden="true">→</i></strong>`, 'data-filter="all" class="pit-directory-door"')}
      <div class="pit-floor-inscription" aria-hidden="true">BUY WELL. SELL BETTER.</div>
    </div>
    <aside class="pit-next-move ${badNotice ? 'has-notice' : ''}"><div><span>${badNotice ? 'DEAL UPDATE' : 'YOUR NEXT MOVE'}</span><p>${esc(badNotice || cue)}</p></div>${move}</aside>
    <nav class="pit-nav" aria-label="Broker navigation">${button('open-market', 'Market <span aria-hidden="true">→</span>', 'data-filter="all"')}${button('open-panel', `Your stock${stock ? ` <b>${stock}</b>` : ''}`, 'data-panel="stock"')}${button('open-panel', 'Your fortune', 'data-panel="fortune"')}${button('finish-review', 'End round', 'class="pit-end-round"')}</nav>
  </section>`;
}

export function focusFrame(g, view) {
  const identity = view.identity, identityRole = identity?.role || view.role || 'capital';
  const running = !!activeLot(g)?.negotiation?.running;
  const role = ['seller', 'buyer', 'startup', 'capital'].includes(identityRole) ? identityRole : 'capital';
  return `<div class="pit-focus-scrim"><section class="pit-focus ${identity ? 'has-identity' : ''} tone-${esc(view.tone || 'plain')} focus-${esc(view.role || 'deal')}" role="dialog" aria-modal="true" aria-labelledby="focus-title" tabindex="-1">
    <header class="pit-focus-heading"><div><span class="pit-focus-eyebrow">HSC · ${view.role === 'market' ? 'MARKET DIRECTORY' : identity ? 'ACROSS THE DESK' : 'THE BROKER’S BOOK'}</span><h2 id="focus-title">${esc(view.title)}</h2></div>${g.phase === 'floor' ? button('close-focus', running ? 'Stop first' : '<span aria-hidden="true">←</span> Floor', `class="pit-focus-close" aria-label="${running ? 'Stop the Charm meter before returning to the floor' : 'Return to the trading floor'}" ${running ? 'disabled' : ''}`) : ''}</header>
    ${identity ? `<aside class="pit-counterparty ${role}"><div class="pit-portrait-window" aria-hidden="true"><span class="pit-portrait-arch"></span>${person(role, identity.name)}</div><div class="pit-counterparty-copy"><span class="pit-counterparty-role">${role === 'seller' ? 'SUPPLIER' : role === 'buyer' ? 'FUNDED BUYER' : role === 'startup' ? 'STARTUP FOUNDER' : 'CAPITAL OFFICE'}</span><h3>${esc(identity.name)}</h3>${identity.subtitle ? `<p>${esc(identity.subtitle)}</p>` : ''}${identity.line ? `<blockquote>“${esc(identity.line)}”</blockquote>` : ''}<span class="pit-reading-note">Reading pauses the floor.</span></div></aside>` : ''}
    <div class="pit-focus-body">${view.body || ''}</div>
    <footer class="pit-focus-footer">${view.footer || ''}</footer>
  </section></div>`;
}

export function directoryView(g, ui = {}) {
  const m = market(g, ui), filter = ['supply', 'buyers'].includes(ui.marketFilter) ? ui.marketFilter : 'all';
  const suppliers = m.lots.map(item => ({ item, role: 'seller' })), buyers = m.buyers.map(item => ({ item, role: 'buyer' }));
  const entries = filter === 'supply' ? suppliers : filter === 'buyers' ? buyers : Array.from({ length: Math.max(suppliers.length, buyers.length) }, (_, i) => [suppliers[i], buyers[i]]).flat().filter(Boolean);
  const selected = ui.gpu ? entries.filter(({ item }) => item.gpu === ui.gpu) : entries;
  const size = 4, pages = Math.max(1, Math.ceil(selected.length / size)), page = Math.max(0, Math.min(pages - 1, Number(ui.page) || 0));
  const rows = selected.slice(page * size, page * size + size).map(({ item, role }) => {
    const seller = role === 'seller', name = seller ? item.firm : item.name, qty = seller ? item.qty : buyerQty(item), price = seller ? item.negotiation?.price ?? item.ask : item.rate;
    return `<button type="button" class="pit-market-row ${role} ${item.gpu === m.relevantGPU ? 'is-relevant' : ''}" data-action="${seller ? 'focus-supplier' : 'focus-buyer'}" data-id="${esc(item.id)}"><span class="pit-market-face" aria-hidden="true">${person(role, name)}</span><span class="pit-market-who"><small>${seller ? 'SUPPLIER' : 'BUYER'} · ${Math.max(0, Math.ceil(item.until - g.arcade.time))}s left</small><b>${esc(name)}</b><span>${qty} ${gpu(item.gpu)} · ${rate(price)}/GPU-hour</span></span><span class="pit-market-amount"><strong>${money(cents(qty, price))}</strong><small>${seller ? 'LOT COST' : 'FUNDED PAYOUT'}</small><i aria-hidden="true">→</i></span></button>`;
  }).join('');
  return { title: ui.gpu ? `${ui.gpu} on the floor` : 'Work the whole room.', role: 'market', body: `<div class="pit-directory"><nav class="pit-market-filters" aria-label="Market type">${[['all', 'Everyone'], ['supply', 'Suppliers'], ['buyers', 'Buyers']].map(([key, label]) => button('open-market', label, `data-filter="${key}" aria-pressed="${filter === key}"`)).join('')}</nav><p class="pit-directory-note">${selected.length} live ${selected.length === 1 ? 'opportunity' : 'opportunities'}. Inspect any desk; your choice stays open.</p><div class="pit-market-list">${rows || '<p class="pit-market-empty">No live quotes in this view. Return to the floor for the next arrival.</p>'}</div></div>`, footer: `<div class="pit-directory-footer"><div class="pit-pagination">${button('market-page', '← Previous', `data-step="-1" ${page === 0 ? 'disabled' : ''}`)}<span>Page <b>${page + 1}</b> of ${pages}</span>${button('market-page', 'Next →', `data-step="1" ${page >= pages - 1 ? 'disabled' : ''}`)}</div><nav class="pit-directory-rooms" aria-label="Other exchange desks">${button('open-panel', 'Capital office', 'data-panel="capital"')}${g.arcade.mandate || g.arcade.mandateCompleted ? button('open-panel', 'Atlas procurement', 'data-panel="mandate"') : ''}</nav></div>` };
}
