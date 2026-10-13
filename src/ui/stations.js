// The banking hall floor: trading desks with beige CRTs, people in lanyards,
// speech bubbles, rival fuses, and your avatar walking between desks.

import { figureSVG } from './character.js';
import { el, $, esc, int, usd, mmss, reducedMotion, stream } from '../util.js';

// Desktop positions (percent of the hall); y is the station's foot line.
// The rostrum stands at the head of the room (top center); two desks sit in the pit.
const SLOTS = [
  { x: 9, y: 38, s: 0.84 }, { x: 27, y: 38, s: 0.84 }, { x: 73, y: 38, s: 0.84 }, { x: 91, y: 38, s: 0.84 },
  { x: 40, y: 57, s: 0.88 }, { x: 60, y: 57, s: 0.88 },
  { x: 9, y: 69, s: 0.92 }, { x: 25, y: 69, s: 0.92 }, { x: 75, y: 69, s: 0.92 }, { x: 91, y: 69, s: 0.92 },
  { x: 15, y: 99, s: 1 }, { x: 35, y: 99, s: 1 }, { x: 65, y: 99, s: 1 }, { x: 85, y: 99, s: 1 },
];

const PLATES = {
  capital: 'CAPITAL DESK',
  rival: (c) => `PADDLE ${c.paddle}`,
  expert: 'THE HOUSE · ASK ME',
  founder: 'RAISING',
};

export function createStations(hall, { ctx, run, onSelect }) {
  const m = run.market;
  const mode = ctx.mode;
  // The room's own streams: the seating plan, and when and what people shout.
  // Neither touches the market, however often a frame runs.
  const plan = stream(run.seed, 'plan');
  const chatter = stream(run.seed, 'chatter');
  const layer = $(hall, '.stations');
  const avatarEl = $(hall, '.avatar');
  const slotOrder = plan.shuffle(SLOTS.map((_, i) => i));
  const used = new Set();
  const views = new Map(); // charId -> view
  let shouting = 0;

  const isDesktop = () => window.matchMedia('(min-width: 980px)').matches;

  function takeSlot(pref) {
    const free = slotOrder.filter((i) => !used.has(i));
    const i = pref != null && !used.has(pref) ? pref : free[0];
    if (i == null) return null;
    used.add(i);
    return i;
  }

  function crtLines(lot) {
    if (!lot) return ['', '', ''];
    const term = lot.terms.length > 1 ? `${lot.terms[0]}-${lot.terms[lot.terms.length - 1]}M` : `${lot.terms[0]}M`;
    const when = lot.delivery === 0 ? 'NOW' : `${lot.delivery}D`;
    return [`${int(lot.qty)} ${lot.gpu}`, `${lot.site.code} ${usd(lot.ask)}`, `${term} ${when}`];
  }

  function addStation(c) {
    const lot = c.lotId ? m.lot(c.lotId) : null;
    const slotIdx = takeSlot(c.slot);
    const slot = SLOTS[slotIdx ?? 0];
    c.slot = slotIdx;
    const hasDesk = !!lot || c.role === 'capital';
    const plate = PLATES[c.role];
    const plateText = typeof plate === 'function' ? plate(c) : plate;
    const node = el(`
      <button class="station side-${c.side} role-${c.role} ${hasDesk ? 'has-desk' : 'no-desk'}" type="button"
        style="--x:${slot.x}%;--y:${slot.y}%;--s:${slot.s};z-index:${Math.round(slot.y)}"
        aria-label="${esc(c.name)}, ${esc(c.firm)}">
        <span class="bubble" aria-hidden="true"><span class="bubble-t"></span></span>
        <span class="figure">${figureSVG(c)}</span>
        ${hasDesk ? `
          <span class="desk">
            <span class="desk-crt beige"><span class="crt-glass crt ${lot ? '' : 'amber'}">
              <span class="l1"></span><span class="l2"></span><span class="l3"></span>
            </span></span>
            <span class="desk-phone-mini"></span>
            <span class="desk-top"></span>
            <span class="desk-front"><span class="desk-name">${esc(c.name.toUpperCase())} · ${esc(c.firm.toUpperCase())}</span>${lot && lot.confirmed ? '<span class="house-ok">HOUSE ✓</span>' : ''}</span>
          </span>` : `<span class="plate">${esc(plateText || c.firm)}</span><span class="plate-name">${esc(c.name)} · ${esc(c.firm)}</span>`}
        <span class="fuse" hidden><span class="fuse-bar"><i></i></span><span class="fuse-t"></span></span>
        <span class="mark" hidden></span>
      </button>`);
    layer.appendChild(node);
    edgeBubble(node, slot.x);
    const v = { c, node, lot, home: slot, nextShout: m.t + chatter.range(0.5, 6), shoutUntil: 0, lineIdx: chatter.int(0, 5) };
    views.set(c.id, v);
    node.addEventListener('click', () => select(v));
    paint(v);
    return v;
  }

  // Bubbles near the hall's left/right edges open inward so they aren't clipped.
  function edgeBubble(node, x) {
    node.classList.toggle('bubble-end', x > 80);
    node.classList.toggle('bubble-start', x < 20);
  }

  function paint(v) {
    const { lot, node, c } = v;
    if (lot) {
      const [l1, l2, l3] = crtLines(lot);
      const glass = $(node, '.crt-glass');
      $(glass, '.l1').textContent = l1;
      $(glass, '.l2').textContent = l2;
      $(glass, '.l3').textContent = l3;
      node.classList.toggle('is-gone', lot.status === 'gone');
      node.classList.toggle('is-closed', lot.status === 'closed');
      node.classList.toggle('is-cooling', lot.status === 'cooling');
      node.classList.toggle('is-late', lot.delivery > run.mandate.deliveryDays);
      node.classList.toggle('is-wrong', !run.mandate.accept.includes(lot.gpu));
      const mark = $(node, '.mark');
      if (lot.status === 'gone') {
        mark.hidden = false;
        mark.className = 'mark stamp';
        mark.textContent = lot.goneReason === 'rival' ? 'GONE' : 'LEFT';
      } else if (lot.status === 'closed') {
        mark.hidden = false;
        mark.className = 'mark stamp spot';
        mark.textContent = 'YOURS';
      } else if (lot.status === 'cooling') {
        mark.hidden = false;
        mark.className = 'mark stamp ink';
        mark.textContent = 'COOLING OFF';
      } else {
        mark.hidden = true;
      }
      node.disabled = lot.status === 'gone' || lot.status === 'closed';
    } else if (c.role === 'capital') {
      const glass = $(node, '.crt-glass');
      $(glass, '.l1').textContent = 'CAPITAL';
      $(glass, '.l2').textContent = 'DESK OPEN';
      $(glass, '.l3').textContent = 'FINANCING';
    }
  }

  function select(v) {
    ctx.audio.tap();
    walkTo(v);
    onSelect(v.c, v.lot);
  }

  // Your avatar walks to the desk you picked (desktop only).
  function walkTo(v) {
    if (!isDesktop()) return;
    const x = parseFloat(v.node.style.getPropertyValue('--x'));
    const y = parseFloat(v.node.style.getPropertyValue('--y'));
    const dx = x > 50 ? -7.5 : 7.5;
    avatarEl.style.setProperty('--x', `${x + dx}%`);
    avatarEl.style.setProperty('--y', `${Math.min(100, y + 2)}%`);
    avatarEl.style.zIndex = Math.round(y + 2);
  }

  function shout(v, text, { force = false, hold = 2.6 } = {}) {
    if (!force && shouting >= 4) return false;
    const b = $(v.node, '.bubble-t');
    b.textContent = text;
    if (!v.node.classList.contains('shouting')) shouting++;
    v.node.classList.add('shouting');
    v.shoutUntil = m.t + hold;
    return true;
  }

  function hush(v) {
    if (v.node.classList.contains('shouting')) shouting = Math.max(0, shouting - 1);
    v.node.classList.remove('shouting');
  }

  // Per-frame: bubbles, fuses, rival positions.
  function tick() {
    const t = m.t;
    for (const v of views.values()) {
      if (v.shoutUntil && t >= v.shoutUntil) { v.shoutUntil = 0; hush(v); }
      const live = !v.lot || v.lot.status === 'open' || v.lot.status === 'cooling';
      if (live && !v.shoutUntil && t >= v.nextShout) {
        const lines = mode.shouts(v.c, run);
        if (shout(v, lines[v.lineIdx++ % lines.length])) v.nextShout = t + chatter.range(5, 11);
        else v.nextShout = t + chatter.range(0.6, 2);
      }
      // Fuse
      if (v.lot) {
        const f = v.lot.fuse;
        const fuse = $(v.node, '.fuse');
        const on = f && !f.done && (v.lot.status === 'open' || v.lot.status === 'cooling');
        fuse.hidden = !on;
        v.node.classList.toggle('is-hot', !!on);
        if (on) {
          const left = Math.max(0, f.endsAt - t);
          $(fuse, 'i').style.width = `${Math.min(100, (left / f.total) * 100)}%`;
          const label = left <= 15 ? `GOING… ${mmss(left)}` : `RIVAL CIRCLING ${mmss(left)}`;
          const ft = $(fuse, '.fuse-t');
          if (ft.textContent !== label) ft.textContent = label;
          fuse.classList.toggle('urgent', left <= 15);
        }
      }
    }
    // Rivals walk over to the lot they're circling.
    if (isDesktop()) {
      for (const v of views.values()) {
        if (v.c.role !== 'rival') continue;
        const target = m.lots.find((l) => l.fuse && !l.fuse.done && l.fuse.rival === v.c && (l.status === 'open' || l.status === 'cooling'));
        const tv = target ? views.get(target.sellerId) : null;
        const pos = tv ? { x: Math.min(90, Math.max(10, tv.home.x + (tv.home.x > 50 ? 8 : -8))), y: tv.home.y + 1.5 } : v.home;
        const want = `${pos.x}%`;
        if (v.node.style.getPropertyValue('--x') !== want) {
          v.node.style.setProperty('--x', want);
          v.node.style.setProperty('--y', `${pos.y}%`);
          v.node.style.zIndex = Math.round(pos.y);
          edgeBubble(v.node, pos.x);
        }
      }
    }
  }

  function flash(lot, dir) {
    const v = views.get(lot.sellerId);
    if (!v) return;
    paint(v);
    const glass = $(v.node, '.crt-glass');
    $(glass, '.l2').textContent = `${lot.site.code} ${dir > 0 ? '▲' : '▼'}${usd(lot.ask)}`;
    v.node.classList.remove('flash-up', 'flash-down');
    void v.node.offsetWidth;
    v.node.classList.add(dir > 0 ? 'flash-up' : 'flash-down');
    setTimeout(() => { v.node.classList.remove('flash-up', 'flash-down'); paint(v); }, 2600);
  }

  // Nearby traders react to your fill.
  function react(lot) {
    const v = views.get(lot.sellerId);
    const lines = ['NICE PRINT!', 'CLEAN FILL!', 'THAT’S A TRADE!', 'SIGNED AND DONE!'];
    const others = [...views.values()].filter((o) => o !== v && (!o.lot || o.lot.status === 'open')).slice(0, 14);
    chatter.shuffle(others).slice(0, 3).forEach((o) => shout(o, chatter.pick(lines), { force: true, hold: 2.2 }));
    if (v) shout(v, 'PLEASURE DOING BUSINESS.', { force: true, hold: 2.4 });
  }

  m.characters.forEach(addStation);
  avatarEl.innerHTML = `<span class="you-tag ui">YOU</span>${figureSVG({ look: { skin: '#E3AE87', hair: '#3B2A1F', hairStyle: 'slick', suit: '#3A3F4A', shirt: 'url(#stripe-blue)', tie: '#B5301F' } }, { you: true })}`;

  const offs = [
    m.on('character:added', (c) => {
      const v = addStation(c);
      v.node.classList.add('arrive');
      shout(v, mode.shouts(c, run)[0], { force: true, hold: 3.2 });
    }),
    m.on('lot:status', (lot) => { const v = views.get(lot.sellerId); if (v) paint(v); }),
    m.on('lot:gone', ({ lot }) => {
      const v = views.get(lot.sellerId);
      if (!v) return;
      hush(v);
      paint(v);
    }),
    m.on('reprice', ({ lots, delta }) => lots.forEach((l) => flash(l, delta))),
    m.on('fuse:warn', (lot) => {
      const rival = lot.fuse?.rival;
      const rv = rival && rival.id ? views.get(rival.id) : null;
      if (rv) shout(rv, `I'LL TAKE ${lot.site.city.toUpperCase()} AT ASK!`, { force: true, hold: 3 });
    }),
  ];

  return {
    tick,
    react,
    shout: (charId, text) => { const v = views.get(charId); if (v) shout(v, text, { force: true }); },
    setEngaged(lotId) {
      for (const v of views.values()) v.node.classList.toggle('is-engaged', !!lotId && v.lot?.id === lotId);
    },
    destroy() { offs.forEach((o) => o()); },
    reduced: reducedMotion(),
  };
}
