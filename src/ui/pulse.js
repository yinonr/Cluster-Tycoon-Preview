// MARKET PULSE (Deal Lab only): the floor at a glance. Public facts only, read
// straight from the market each refresh: the reference rate and how it moved,
// each live desk's posted ask against it, size, delivery, terms, and a rival's
// fuse. No seller wants, floors or rankings: it says what is on the floor, not
// which deal to take. Tap a row to open that desk's lot sheet. Reads state,
// never draws randomness, so the floor plays the same with or without it.

import { $, esc, int, mmss, usd } from '../util.js';
import { badge, fitTag } from '../tycoon/gpu.js';

const cents = (d) => Math.round(d * 100);
const signed = (c) => (c > 0 ? `+${c}¢` : c < 0 ? `−${-c}¢` : '±0¢');

export function createPulse(node, { market: m, mandate: md, run, mode, onPick, onBuyer }) {
  node.innerHTML = `
    <div class="pulse-h ui"><b>MARKET PULSE</b> <span class="pulse-ref"></span> <span class="pulse-move"></span></div>
    <ol class="pulse-rows"></ol>`;
  const ref = $(node, '.pulse-ref');
  const move = $(node, '.pulse-move');
  const rows = $(node, '.pulse-rows');
  let lastMove = null; // the last bulletin that moved a rate the need sheet takes
  let sig = '';

  const lots = () => m.lots.filter((l) => (l.status === 'open' || l.status === 'cooling') && l.sellerId && (mode.pulseAll || md.accept.includes(l.gpu)));

  function row(l) {
    const b = m.bench[l.gpu];
    // The price the lot sheet opens at (your term), and the gap at 12 months, like the reference.
    const term = mode.defaultTerm ? mode.defaultTerm(l, run) : l.baseTerm;
    const price = m.askAt(l, term);
    const vs = cents(m.askAt(l, 12) - b);
    const fuse = l.fuse && !l.fuse.done ? Math.max(0, l.fuse.endsAt - m.t) : null;
    const blocked = mode.blockedLot ? mode.blockedLot(run, l) : null;
    const moved = l.lastMove && m.t - l.lastMove.at < 20 ? cents(l.lastMove.to - l.lastMove.from) : 0;
    const tags = [
      fuse != null ? `<i class="pt pt-rival" data-until="${l.fuse.endsAt}" data-label="RIVAL ON IT">RIVAL ON IT ${mmss(fuse)}</i>` : '',
      moved ? `<i class="pt pt-moved">ASK ${moved > 0 ? '▲' : '▼'}${Math.abs(moved)}¢</i>` : '',
      l.status === 'cooling' ? '<i class="pt">COOLING</i>' : '',
    ].join('');
    const deliv = l.delivery === 0 ? 'today' : `${l.delivery}d`;
    return {
      key: `${l.id}|${price}|${term}|${l.qty}|${l.status}|${fuse == null ? '' : l.fuse.endsAt}|${moved}|${blocked ? 1 : 0}|${b}`,
      html: `<li><button class="pulse-row${fuse != null ? ' hot' : ''}${blocked || l.status === 'cooling' ? ' dim' : ''}" type="button" data-lot="${esc(l.id)}">
        <span class="pr-what"><b>${int(l.qty)}</b> ${badge(l.gpu)} ${esc(l.site.city)}${mode.pulseFit && mode.pulseFit(run, l) ? ` ${fitTag(mode.pulseFit(run, l))}` : ''}</span>
        <span class="pr-ask"><b>${usd(price)}</b> @${term}M <em class="${vs < 0 ? 'under' : vs > 0 ? 'over' : ''}">${signed(vs)} vs ref at 12M</em></span>
        <span class="pr-terms">${deliv} · ${l.terms.join('/')}M</span>
        ${tags ? `<span class="pr-tags">${tags}</span>` : ''}
      </button></li>`,
    };
  }

  function refresh() {
    const g = md.gpu;
    const d = cents(m.bench[g] - m.open[g]);
    ref.innerHTML = `${esc(g)} ref <b>${usd(m.bench[g])}</b> <span class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '·'}${d ? `${Math.abs(d)}¢ since noon` : ' flat since noon'}</span>`;
    move.textContent = lastMove && m.t - lastMove.at < 25 ? `${lastMove.gpu} ${lastMove.delta > 0 ? 'jumped' : 'fell'} ${Math.abs(lastMove.delta)}¢ on the news` : '';
    // Rival fuses first (they won't wait), then the floor's order. Never sorted by price.
    const live = lots().sort((a, b) => (a.fuse && !a.fuse.done ? 0 : 1) - (b.fuse && !b.fuse.done ? 0 : 1));
    // The Deal Lab's aftermarket: buyers on the floor come first (they leave on a clock).
    const buyers = (mode.pulseBuyers ? mode.pulseBuyers(run) : []).map((b) => {
      const left = Math.max(0, b.endsAt - m.t);
      const ask = b.state === 'final' ? b.final : b.bid;
      return {
        key: `${b.id}|${b.state}|${ask}|${b.endsAt}`,
        html: `<li><button class="pulse-row buyer" type="button" data-buyer="${esc(b.id)}">
        <span class="pr-what"><b>${esc((b.kind || 'buyer').toUpperCase())}</b> ${esc(b.firm)}</span>
        <span class="pr-ask">wants <b>${int(b.qty)}</b> ${badge(b.gpu)} at <b>${usd(ask)}</b>${b.stake > 0 ? ` <i class="pt">YOU OWN ${(100 * b.stake).toFixed(1)}%</i>` : b.equityOk ? ' <i class="pt">EQUITY OK</i>' : ''}</span>
        <span class="pr-terms">${b.minTerm}+ mo${b.delivery > 30 ? ' · any delivery' : ''}</span>
        <span class="pr-tags"><i class="pt pt-buyer" data-until="${b.endsAt}" data-label="LEAVES">LEAVES ${mmss(left)}</i></span>
      </button></li>`,
      };
    });
    const built = [...buyers, ...live.map(row)];
    // Rebuild only when the floor changes; clocks tick in place (a tap never lands on a rebuilt row).
    const s = built.map((r) => r.key).join(';');
    if (s !== sig) {
      sig = s;
      rows.innerHTML = built.length ? built.map((r) => r.html).join('') : '<li class="pulse-none muted">No usable blocks posted right now. Watch the news.</li>';
    }
    rows.querySelectorAll('[data-until]').forEach((el) => {
      const t = `${el.dataset.label} ${mmss(Math.max(0, Number(el.dataset.until) - m.t))}`;
      if (el.textContent !== t) el.textContent = t;
    });
  }

  rows.addEventListener('click', (e) => {
    const btn = e.target.closest('.pulse-row');
    if (!btn) return;
    if (btn.dataset.buyer) { const b = (run.labBuyers || []).find((x) => x.id === btn.dataset.buyer); if (b && onBuyer) onBuyer(b); return; }
    const l = m.lot(btn.dataset.lot);
    if (l && (l.status === 'open' || l.status === 'cooling')) onPick(m.character(l.sellerId), l);
    else refresh();
  });

  const offs = [
    m.on('reprice', ({ gpu, delta }) => { if (md.accept.includes(gpu) && delta) lastMove = { gpu, delta: cents(delta), at: m.t }; refresh(); }),
    m.on('bulletin', refresh), m.on('lot:added', refresh), m.on('lot:gone', refresh), m.on('lot:status', refresh), m.on('fuse:set', refresh),
  ];
  let acc = 0;
  refresh();
  return {
    tick(dt) { acc += dt; if (acc >= 0.25) { acc = 0; refresh(); } },
    refresh,
    destroy() { offs.forEach((o) => o()); },
  };
}
