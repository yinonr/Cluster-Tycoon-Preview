import { esc, newSeed } from '../util.js';
import { signalOf } from '../tycoon/game.js';
import { V7, advance, available, activeLot, cash, cashCapacity, cents, claim, haggle, leave, buy, owned, remaining, inventoryCost, prepareDelivery, deliveryQuote, deliver, closeQuarter, openQuarter, score, portfolio, notice } from '../tycoon/arcade.js';
import { arcadeStore } from '../tycoon/arcade-store.js';
import { rizzParameters, markerAt, startRizz, resolveRizz, recoverRizz } from '../tycoon/rizz.js';

const root = document.querySelector('#arcade');
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw Error('Storage blocked'); } }; }
const store = arcadeStore(storage);
if (store.state) store.act(recoverRizz);
const money = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(c / 100);
const badge = gpu => `<span class="gpu ${gpu}">${gpu}</span>`;
const btn = (action, label, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
let last = performance.now(), lastPaint = '', returnFocus = null;
let meterStart = 0, meterFrame = 0, meterKey = null;
const act = fn => { const ok = store.act(fn); if (ok || store.error) render(); return ok; };
const head = () => `<header class="masthead"><div><p class="eyebrow">Haight Street Compute · V7 playtest</p><h1>Cluster Tycoon</h1><p class="muted">Easy to make a deal. Hard to make a great deal.</p></div><span class="eyebrow">The Trading Arcade</span></header>`;

function orderCard(g, o) {
  const qty = Math.min(remaining(o), owned(g, o.gpu));
  const funded = cashCapacity(g, o), defaultQty = funded ? Math.min(qty, funded) : qty;
  return `<article class="panel" data-order="${o.id}"><p class="eyebrow">${o.client === g.arcade.anchor ? 'Your anchor startup' : 'Startup opportunity'}</p><h2>${esc(o.name)}</h2><p>${badge(o.gpu)} ${remaining(o) ? `${remaining(o)} GPUs still needed` : '<b class="good">Order complete · launch compute secured</b>'}</p><div class="progress" role="progressbar" aria-label="${esc(o.name)} order progress" aria-valuemin="0" aria-valuemax="${o.qty}" aria-valuenow="${o.delivered}"><span style="width:${100 * o.delivered / o.qty}%"></span></div><p><b>${o.delivered} / ${o.qty} delivered</b> · ${owned(g, o.gpu)} in your inventory</p><p>Order value <b>${money(cents(o.qty, o.rate))}</b><br>Cash for ${funded} more GPUs · or take equity</p>${qty ? `<div class="order-controls"><label>GPUs<input aria-label="GPUs for ${esc(o.name)}" type="number" value="${defaultQty}" min="1" max="${qty}" step="1"></label><label>Receive<select aria-label="Compensation for ${esc(o.name)}"><option value="cash" ${!funded ? 'disabled' : ''}>Cash</option><option value="equity" ${!funded ? 'selected' : ''}>Startup equity</option></select></label>${btn('prepare', 'Review delivery', `data-id="${o.id}" class="primary"`)}</div>` : `<p class="muted">${remaining(o) ? `Buy ${o.gpu}, then deliver any amount for cash or equity.` : 'Completion reward: Trust +1 · Clout +40.'}</p>`}</article>`;
}

const cashOrder = (g, l) => g.arcade.orders.find(o => o.gpu === l.gpu && cashCapacity(g, o) > owned(g, o.gpu)) || g.arcade.orders.find(o => o.gpu === l.gpu && remaining(o));

function lotCard(g, l) {
  const rate = l.negotiation?.price ?? l.ask, cost = cents(l.qty, rate);
  const o = cashOrder(g, l);
  const cover = o ? Math.min(l.qty, Math.max(0, cashCapacity(g, o) - owned(g, o.gpu))) : 0, expected = o ? cents(cover, o.rate) - cost : -cost;
  return `<article class="lot ${l.gpu} ${l.flash ? 'flash' : ''} ${g.arcade.time - l.at < 2 ? 'new' : ''}" data-lot="${l.id}"><span>${badge(l.gpu)} <b>× ${l.qty}</b></span><h3>${esc(l.firm)}</h3><p class="price">${money(cost)}</p><p>Total commitment · fully prepaid</p><p class="${cover && expected >= 0 ? 'good' : 'bad'}">${cover ? `${cover} toward ${esc(o.name)} · ${expected >= 0 ? '+' : ''}${money(expected)} if delivered for cash` : (o ? 'No uncovered cash demand · equity or speculation' : 'No active order · speculative inventory')}</p><p class="${l.flash ? 'flash-label' : 'muted'}">${l.flash ? '⚡ FLASH' : 'Regular offer'} · <span data-expiry="${l.id}">${Math.ceil(l.until - g.arcade.time)}</span>s of floor time</p>${btn('claim', 'Claim & negotiate', `data-id="${l.id}"`)}</article>`;
}

function floor(g) {
  const a = g.arcade, next = a.lots.find(l => l.status === 'open' && l.at > a.time);
  const lots = a.lots.filter(l => available(g, l));
  return `${head()}<div class="stats"><div class="stat">Cash available<b>${money(cash(g))}</b></div><div class="stat">Realized profit<b>${money(Math.round(g.profit * 100))}</b></div><div class="stat">Quarter ${g.q}<b data-clock>${Math.ceil(V7.seconds - a.time)}s</b></div><div class="stat">Clout · Tycoon Score<b>${g.clout} · ${score(g).total}</b></div></div><div class="message ${a.message?.tone || ''}" role="status">${esc(a.message?.text || '')}</div><div class="columns"><section><div class="row"><h2>Supply floor</h2><small data-floor-state>${a.active || a.confirm ? 'PAUSED · take your time' : 'LIVE · claim to pause'}</small></div><p class="muted">Claiming costs nothing. Compare the whole lot’s cost with the order it can fill.</p><div class="lots">${lots.map(l => lotCard(g, l)).join('') || '<p>No open lots right now. Your inventory can still be delivered.</p>'}</div><p class="muted" data-next>${next ? `Next release in ${Math.ceil(next.at - a.time)}s of floor time.` : 'All releases are on the board. Supply is finite.'}</p><details><summary>How your money and compute work</summary>Each purchase is a three-month compute-service block, paid in full. Transfer GPUs to a startup for immediate cash payment or shares. No future supplier payments, borrowing, or guaranteed sublets. Unused rights expire at the bell and their full cost becomes a loss. Pending demand is not cash. Inventory at cost: ${money(inventoryCost(g))}. Unpaid commitments: $0.</details><div class="actions">${btn('finish-review', 'Finish quarter', 'class="quiet"')}</div></section><aside class="orders">${a.orders.map(o => orderCard(g, o)).join('')}<details class="panel"><summary>Portfolio · ${money(Math.round(portfolio(g) * 100))} paper value</summary><p>Shares are speculative. They do not count as cash or realized profit.</p>${g.startups.filter(s => s.stake).map(s => `<div class="portfolio-item"><b>${esc(s.name)}</b><p>${(s.stake * 100).toFixed(3)}% ownership · ${esc(signalOf(s))}</p></div>`).join('') || '<p>Deliver compute for equity to begin your portfolio.</p>'}</details></aside></div>`;
}

function rizzPanel(g, l) {
  const n = l.negotiation, running = n.running && n.attempts[n.running - 1], p = running?.params || rizzParameters(g, l);
  if (n.closed) return `<div class="rizz-result bad"><b>SUPPLIER WALKED</b><p>This lot is gone. Reliable purchases from this firm in later quarters rebuild Trust.</p></div>`;
  if (!p || p.concession <= 0) return `<div class="rizz-result"><b>${n.attempts.length === 3 ? 'Three attempts used.' : 'Best available price reached.'}</b><p>Bank the current price or return to the floor.</p></div>`;
  const labels = ['Rizz', 'Push your luck', 'Over-Rizz'];
  const risk = ['A miss keeps your current quote. A severe miss costs 1 Trust.', 'Near miss: lose half your Rizz gains, −1 Trust. Larger miss: lose all Rizz gains, −2 to −4 Trust.', 'Near miss: lose Rizz gains, −3 Trust. Larger miss: lose all negotiated gains, −5 Trust. Severe miss: seller walks, −8 Trust and −20 Clout.'];
  return `<section class="rizz-panel tier-${p.attempt}" aria-label="Rizz negotiation"><div class="row"><h3>${labels[p.attempt - 1]} · ${p.attempt} / 3</h3><span class="eyebrow">${p.attempt === 1 ? 'First shot. Best reward.' : p.attempt === 2 ? 'A smaller reward. More risk.' : 'Last shot. Real consequences.'}</span></div><p><b class="good">Hit: save another ${money(cents(l.qty, p.concession))}</b>${p.attempt > 1 ? ` · ${money(cents(l.qty, Math.max(0, n.base - n.price)))} of Rizz gains at risk` : ''}</p><p class="risk">${risk[p.attempt - 1]}</p><p class="muted">Trust ${p.trust} · Clout ${p.clout} · target ${Math.round(p.width * 100)}% wide · ${p.speed.toFixed(2)} bar widths/sec</p>${!n.attempts.length ? `<label class="assist"><input type="checkbox" data-assist ${g.arcade.assistance ? 'checked' : ''}> Calm pace: 45% slower, 35% smaller rewards</label>` : ''}<div class="meter" aria-hidden="true"><span class="target" style="left:${(0.5 - p.width / 2) * 100}%;width:${p.width * 100}%"></span><span class="marker" style="left:${markerAt(p, 0) * 100}%"></span></div><p class="small muted">${running ? 'Tap STOP, click, or press Space / Enter. The floor stays paused.' : 'Stop the moving marker inside the bright target. Ordinary counteroffers need no timing.'}</p>${running ? btn('stop-rizz', 'STOP THE MARKER', 'class="stop-rizz primary"') : btn('start-rizz', `${p.attempt === 1 ? 'Try Rizz' : p.attempt === 2 ? 'Risk attempt 2' : 'Risk Over-Rizz'}`, `class="${p.attempt === 3 ? 'danger' : 'primary'}"`)}<p class="muted small">Starting consumes an attempt. Reloading mid-attempt counts as a severe miss.</p></section>`;
}

function negotiation(g, l) {
  const n = l.negotiation, cost = cents(l.qty, n.price), f = g.firms[l.firm];
  const o = cashOrder(g, l), cover = o ? Math.min(l.qty, Math.max(0, cashCapacity(g, o) - owned(g, o.gpu))) : 0;
  return `<div class="modal-content"><p class="eyebrow">Claimed · floor paused · no purchase yet</p><h2 id="dialog-title">${esc(l.firm)}</h2><p>${badge(l.gpu)} <b>${l.qty} GPUs</b> · Trust ${f?.trust || 0}</p><p class="total">${money(cost)}</p><p>Total purchase cost · all three months paid</p><div class="economics"><span>Cash available</span><strong>${money(cash(g))}</strong><span>Cash after signing</span><strong class="${cost > cash(g) ? 'bad' : ''}">${money(cash(g) - cost)}</strong><span>Uncovered cash-order fit</span><strong>${cover} / ${l.qty} GPUs</strong><span>Expected cash-delivery profit</span><strong>${money((o ? cents(cover, o.rate) : 0) - cost)}</strong></div><p class="muted">${cover ? `Payment requires a separate delivery to ${esc(o.name)} after buying. ${l.qty - cover ? `${l.qty - cover} GPUs have no active buyer.` : ''}` : (o ? 'Existing inventory or the startup cash budget limits cash sales. Equity is speculative and brings in no cash.' : 'No active buyer for this lot. Unused capacity loses its full cost.')}</p><div class="message ${g.arcade.message?.tone || ''}" role="status">${esc(g.arcade.message?.text || '')}</div><div class="actions">${btn('haggle', `Counteroffer${n.haggles ? ` (${2 - n.haggles} left)` : ''}`, n.haggles >= 2 || n.attempts.length || n.running || n.closed ? 'disabled' : '')}</div>${rizzPanel(g, l)}<details><summary>Supplier & contract reference</summary>${esc(l.profile)}. ${money(n.price)} per GPU-hour × ${V7.hours} hours × ${l.qty} GPUs. Fixed three-month service rights; immediately assignable, fully paid. No remaining liability or finance fee.</details></div><div class="actions modal-footer">${btn('buy', `Sign & pay · ${money(cost)}`, `class="primary" ${cost > cash(g) || n.running || n.closed ? 'disabled' : ''}`)}${btn('leave', 'Back to floor', `class="quiet" ${n.running ? 'disabled' : ''}`)}</div>`;
}

function confirmation(g) {
  const c = g.arcade.confirm;
  if (c.restart) return `<h2 id="dialog-title">Start a fresh broker run?</h2><p>This replaces your current V7 run. Earlier version saves are preserved.</p><div class="actions">${btn('restart', 'Start fresh', 'class="danger"')}${btn('cancel', 'Keep this run')}</div>`;
  if (c.finish) return `<h2 id="dialog-title">Close this quarter?</h2><p>Unsold inventory expires with no refund. ${money(inventoryCost(g))} will become a realized loss.</p><div class="actions">${btn('finish', 'Close quarter', 'class="danger"')}${btn('cancel', 'Keep trading')}</div>`;
  const d = deliveryQuote(g, c.orderId, c.qty, c.payment), o = g.arcade.orders.find(o => o.id === c.orderId);
  if (!d) return `<h2 id="dialog-title">Delivery unavailable</h2>${btn('cancel', 'Back to floor')}`;
  return `<p class="eyebrow">Delivery confirmation · floor paused</p><h2 id="dialog-title">${esc(o.name)}</h2><p>${d.qty} ${badge(o.gpu)} · ${o.delivered + d.qty} / ${o.qty} delivered after signing</p><div class="economics"><span>Supply already paid</span><strong>${money(d.cost)}</strong><span>Cash received now</span><strong>${money(d.revenue)}</strong><span>Realized profit / loss</span><strong>${money(d.revenue - d.cost)}</strong><span>Cash after delivery</span><strong>${money(cash(g) + d.revenue)}</strong>${c.payment === 'equity' ? `<span>New total ownership</span><strong>${(d.stake * 100).toFixed(3)}%</strong>` : ''}</div><p>${c.payment === 'equity' ? 'Compute worth ' + money(d.value) + ' buys shares at the current valuation. No cash comes in. The supply cost is a realized expense; the shares may fail or eventually pay at an acquisition.' : 'Transfer these fully paid service rights and receive the cash payment now. Each GPU can be assigned once.'}</p><div class="actions">${btn('deliver', `Confirm ${c.payment} delivery`, 'class="primary"')}${btn('cancel', 'Back', 'class="quiet"')}</div>`;
}

function report(g) {
  const r = g.arcade.history.at(-1);
  return `${head()}<section class="report panel"><p class="eyebrow">Quarter ${r.q} · books closed</p><h2>${r.orders[0].milestone ? 'You powered their next step.' : 'Every deal leaves a mark.'}</h2><div class="stats"><div class="stat">Quarter profit<b>${money(Math.round(r.profit * 100))}</b></div><div class="stat">Cash available<b>${money(cash(g))}</b></div><div class="stat">Delivered<b>${r.delivered} GPUs</b></div><div class="stat">Expired inventory loss<b>${money(r.lost)}</b></div></div>${r.orders.map(o => `<p><b>${esc(o.name)}</b> · ${o.delivered}/${o.qty} ${o.gpu} delivered${o.milestone ? ' · ORDER COMPLETE · Clout +40' : ''}</p>`).join('')}<h3>Your startups</h3>${r.startups.map(s => `<article class="portfolio-item"><p><b>${esc(s.name)} · ${esc(s.status)}</b></p><p>${esc(s.text)} ${esc(s.delivery || '')}</p>${s.stake ? `<p>${(s.stake * 100).toFixed(3)}% ownership · ${money(Math.round(s.paper * 100))} paper value</p>` : ''}</article>`).join('')}${r.lines.map(l => `<p>${esc(l.text)}</p>`).join('')}<p>Tycoon Score ${score(g).total} = profit ${score(g).profit} + Clout ${score(g).clout} + compute ${score(g).cp}. Paper equity is excluded.</p><p class="muted">Next quarter: new finite supply. ${g.q <= 2 ? 'Build your anchor relationship before the wider market opens in Q3.' : 'Compare opportunities across startup customers.'}</p>${btn('next', `Open quarter ${g.q}`, 'class="primary"')} ${btn('restart-review', 'New broker run', 'class="quiet"')}</section>`;
}

function render() {
  cancelAnimationFrame(meterFrame);
  const focused = document.activeElement?.dataset?.action;
  const g = store.state;
  if (store.error) { root.innerHTML = `<div class="shell"><h1>Trading paused</h1><p role="alert">${esc(store.error)}</p></div>`; return; }
  if (!g) { root.innerHTML = `<div class="shell">${head()}<section class="welcome panel"><p class="eyebrow">Start small. Make the next deal count.</p><h1>Could you become the next Cluster Tycoon?</h1><p>Imagine if compute buyers, sellers, and the money were all in one room.</p><ol><li>Claim a small GPU lot. The floor pauses while you negotiate.</li><li>Find a good price and sign. Deliver part of your startup’s order.</li><li>Take cash for the next deal, or equity in their future.</li></ol><p>You start with $65,000 and one startup to supply. Your V7 progress saves separately on this device.</p>${btn('start', 'Start trading', 'class="primary"')}<p class="muted">Existing game: <a href="lab.html">V6.4 / Daily Floor / Venture</a></p></section></div>`; return; }
  root.innerHTML = `<div class="shell">${g.phase === 'floor' ? floor(g) : report(g)}</div>${activeLot(g) || g.arcade.confirm ? `<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${activeLot(g) ? negotiation(g, activeLot(g)) : `<div class="modal-content">${confirmation(g)}</div>`}</section></div>` : ''}`;
  const modal = root.querySelector('.modal');
  root.querySelector('.shell').inert = !!modal;
  if (modal) (modal.querySelector('[data-action="stop-rizz"]') || modal.querySelector(`[data-action="${focused}"]:not(:disabled)`) || modal.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
  else if (returnFocus) { root.querySelector(returnFocus)?.focus({ preventScroll: true }); returnFocus = null; }
  lastPaint = g.phase === 'floor' ? visibleKey(g) : '';
  if (activeLot(g)?.negotiation.running) {
    const key = `${activeLot(g).id}:${activeLot(g).negotiation.running}`;
    if (meterKey !== key) { meterKey = key; meterStart = performance.now(); }
    const params = activeLot(g).negotiation.attempts.at(-1).params;
    const marker = root.querySelector('.marker');
    const animate = now => { marker.style.left = `${markerAt(params, now - meterStart) * 100}%`; meterFrame = requestAnimationFrame(animate); };
    meterFrame = requestAnimationFrame(animate);
    root.querySelector('[data-action="stop-rizz"]')?.scrollIntoView({ block: 'nearest' });
  } else { meterKey = null; if (focused === 'stop-rizz') root.querySelector('.rizz-panel, .rizz-result')?.scrollIntoView({ block: 'nearest' }); }
}

const visibleKey = g => g.arcade.lots.filter(l => available(g, l)).map(l => l.id).join(',');
root.addEventListener('click', e => {
  const b = e.target.closest('button[data-action]'); if (!b || b.disabled) return;
  const action = b.dataset.action;
  if (action === 'start') { const p = new URLSearchParams(location.search).get('seed'); store.start(p && /^\d+$/.test(p) ? Number(p) >>> 0 : newSeed()); if (matchMedia('(prefers-reduced-motion: reduce)').matches) store.act(g => { g.arcade.assistance = true; return true; }); render(); return; }
  if (action === 'claim') { returnFocus = `[data-action="claim"][data-id="${b.dataset.id}"]`; act(g => claim(g, b.dataset.id)); }
  else if (action === 'haggle') act(haggle);
  else if (action === 'start-rizz') act(startRizz);
  else if (action === 'stop-rizz') stopMeter();
  else if (action === 'buy') act(buy);
  else if (action === 'leave') act(leave);
  else if (action === 'prepare') { const card = b.closest('[data-order]'); returnFocus = `[data-action="prepare"][data-id="${b.dataset.id}"]`; act(g => { if (prepareDelivery(g, b.dataset.id, Number(card.querySelector('input').value), card.querySelector('select').value)) return true; notice(g, 'Delivery unavailable: use a whole GPU quantity within your inventory and the order. For cash, stay within the startup’s cash budget, or choose equity.', 'bad'); return true; }); }
  else if (action === 'deliver') act(deliver);
  else if (action === 'cancel') act(g => { g.arcade.confirm = null; return true; });
  else if (action === 'finish-review') act(g => { if (g.arcade.active || g.arcade.confirm) return false; g.arcade.confirm = { finish: true }; return true; });
  else if (action === 'finish') act(g => { g.arcade.confirm = null; return closeQuarter(g); });
  else if (action === 'next') act(openQuarter);
  else if (action === 'restart-review') act(g => { g.arcade.confirm = { restart: true }; return true; });
  else if (action === 'restart') { store.restart(newSeed()); render(); }
});
function stopMeter() {
  const l = activeLot(store.state), entry = l?.negotiation?.running && l.negotiation.attempts.at(-1);
  // Debounce the input that started the meter; consume a single normalized result.
  if (!entry || performance.now() - meterStart < 180) return;
  const pos = markerAt(entry.params, performance.now() - meterStart);
  act(g => resolveRizz(g, pos));
}
root.addEventListener('change', e => { if (e.target.matches('[data-assist]')) act(g => { const n = activeLot(g)?.negotiation; if (!n || n.attempts.length) return false; g.arcade.assistance = e.target.checked; return true; }); });
document.addEventListener('keydown', e => {
  const modal = root.querySelector('.modal'); if (!modal) return;
  if ((e.key === ' ' || e.key === 'Enter') && activeLot(store.state)?.negotiation?.running) { e.preventDefault(); if (!e.repeat) stopMeter(); return; }
  if (e.key === 'Escape') { e.preventDefault(); if (store.state.arcade.confirm) act(g => { g.arcade.confirm = null; return true; }); else act(leave); }
  if (e.key === 'Tab') { const all = [...modal.querySelectorAll('button:not(:disabled), input, select, summary, a')]; const first = all[0], end = all.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); } else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); } }
});
setInterval(() => {
  const now = performance.now(), dt = (now - last) / 1000; last = now;
  const g = store.state;
  if (!g || store.error || document.hidden || g.phase !== 'floor' || g.arcade.active || g.arcade.confirm) return;
  if (!store.act(g => advance(g, dt))) { if (store.error) render(); return; }
  const next = store.state;
  if (next.phase !== 'floor' || lastPaint !== visibleKey(next)) { render(); return; }
  root.querySelector('[data-clock]').textContent = `${Math.ceil(V7.seconds - next.arcade.time)}s`;
  for (const el of root.querySelectorAll('[data-expiry]')) el.textContent = Math.ceil(next.arcade.lots.find(l => l.id === el.dataset.expiry).until - next.arcade.time);
  const upcoming = next.arcade.lots.find(l => l.at > next.arcade.time);
  root.querySelector('[data-next]').textContent = upcoming ? `Next release in ${Math.ceil(upcoming.at - next.arcade.time)}s of floor time.` : 'All releases are on the board. Supply is finite.';
}, 250);
window.addEventListener('storage', e => { if (e.key === V7.key) { store.act(() => true); render(); } });
render();
