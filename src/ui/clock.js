// The big analog clock on the board. Noon → five.

export function clockSVG() {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const r1 = i % 5 === 0 ? 38 : 41;
    const x1 = 50 + Math.sin(a) * r1, y1 = 50 - Math.cos(a) * r1;
    const x2 = 50 + Math.sin(a) * 44, y2 = 50 - Math.cos(a) * 44;
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke-width="${i % 5 === 0 ? 2.2 : 0.8}"/>`;
  }).join('');
  const nums = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<text x="${(50 + Math.sin(a) * 31).toFixed(2)}" y="${(50 - Math.cos(a) * 31 + 3.6).toFixed(2)}" text-anchor="middle">${n}</text>`;
  }).join('');
  // Shade the trading window, 12 → 5.
  const arc = (from, to, r) => {
    const a0 = (from / 12) * Math.PI * 2, a1 = (to / 12) * Math.PI * 2;
    const p = (a) => `${(50 + Math.sin(a) * r).toFixed(2)} ${(50 - Math.cos(a) * r).toFixed(2)}`;
    return `M50 50 L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`;
  };
  return `<svg class="clock" viewBox="0 0 100 100" role="img" aria-label="Market clock">
    <circle cx="50" cy="50" r="48" class="clock-rim"/>
    <circle cx="50" cy="50" r="45" class="clock-face"/>
    <path d="${arc(0, 5, 45)}" class="clock-window"/>
    <path class="clock-elapsed" d="M50 50"/>
    <g class="clock-ticks">${ticks}</g>
    <g class="clock-nums">${nums}</g>
    <line class="hand hand-h" x1="50" y1="54" x2="50" y2="27"/>
    <line class="hand hand-m" x1="50" y1="56" x2="50" y2="14"/>
    <circle cx="50" cy="50" r="2.6" class="clock-pin"/>
  </svg>`;
}

// mins = minutes since noon
export function setClock(svg, mins) {
  const h = svg.querySelector('.hand-h');
  const m = svg.querySelector('.hand-m');
  const hourDeg = ((mins / 60) % 12) * 30;
  const minDeg = (mins % 60) * 6;
  h.setAttribute('transform', `rotate(${hourDeg.toFixed(2)} 50 50)`);
  m.setAttribute('transform', `rotate(${minDeg.toFixed(2)} 50 50)`);
  const el = svg.querySelector('.clock-elapsed');
  const a = Math.min(hourDeg, 150) * Math.PI / 180;
  if (a <= 0) { el.setAttribute('d', 'M50 50'); return; }
  const x = 50 + Math.sin(a) * 45, y = 50 - Math.cos(a) * 45;
  el.setAttribute('d', `M50 50 L50 5 A45 45 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`);
}
