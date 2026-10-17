// Flat vector traders in 80s business wardrobe: power shoulders, striped
// shirts, loud ties, lanyards in their side's color. Colors go through
// style="fill:…" so CSS variables (house jackets, side colors) resolve.

const f = (c) => `style="fill:${c}"`;

function hairBack(style, color) {
  switch (style) {
    case 'bighair': return `<ellipse cx="50" cy="35" rx="22" ry="21" ${f(color)}/><ellipse cx="50" cy="52" rx="19" ry="9" ${f(color)}/>`;
    case 'bob': return `<path d="M33 34 C33 20 42 16 50 16 C58 16 67 20 67 34 L68 55 C62 58 38 58 32 55 Z" ${f(color)}/>`;
    case 'curly': return `<g ${f(color)}><circle cx="38" cy="28" r="7"/><circle cx="50" cy="23" r="8"/><circle cx="62" cy="28" r="7"/><circle cx="35" cy="37" r="5"/><circle cx="65" cy="37" r="5"/></g>`;
    default: return '';
  }
}

function hairFront(style, color) {
  switch (style) {
    case 'slick': return `<path d="M36.4 37 C35.6 22 43 18.5 50 18.5 C58 18.5 64.6 22.5 63.8 37 C61 28.5 56 26 50 26 C44 26 39.5 29 36.4 37 Z" ${f(color)}/>`;
    case 'short': return `<path d="M36.5 35 C36 22 43 19 50 19 C58 19 64.5 22 63.8 35 C60 31 57 27.5 52 28.5 C47 26.5 41 30 36.5 35 Z" ${f(color)}/>`;
    case 'bighair': return `<path d="M35 36 C34 20 44 17 50 17 C58 17 66 21 65 36 C60 27 55 25 47 27 C42 28 38 31 35 36 Z" ${f(color)}/>`;
    case 'bob': return `<path d="M36 33 C37 23 44 20 50 20 C57 20 63 23 64 33 C58 28 42 28 36 33 Z" ${f(color)}/>`;
    case 'curly': return '';
    case 'bald': return `<path d="M36.6 40 C36.2 35 37 33 38 32 L38.5 41 Z M63.4 40 C63.8 35 63 33 62 32 L61.5 41 Z" ${f(color)}/>`;
    default: return '';
  }
}

export function figureSVG(c, { you = false } = {}) {
  const L = c.look;
  const tie = L.tie ? `<path d="M48 67.5 L52 67.5 L54.2 88 L50 94 L45.8 88 Z" ${f(L.tie)}/><path d="M47.6 67 L52.4 67 L51.4 71 L48.6 71 Z" ${f(L.tie)} opacity=".85"/>` : '';
  const glasses = L.glasses
    ? '<g fill="none" stroke="#1B1814" stroke-width="1.4"><rect x="39.5" y="35" width="9" height="7.5" rx="2.4"/><rect x="51.5" y="35" width="9" height="7.5" rx="2.4"/><path d="M48.5 38 L51.5 38"/></g>'
    : '';
  const phone = L.phone
    ? `<g class="phone-arm">
        <path d="M29 78 C26 66 28 56 33 50" stroke-linecap="round" stroke-width="11" fill="none" style="stroke:${L.suit}"/>
        <circle cx="34" cy="47" r="5.5" ${f(L.skin)}/>
        <rect x="27.5" y="31" width="9" height="25" rx="4.5" transform="rotate(-14 32 43)" style="fill:#D8CCB2;stroke:#1B1814;stroke-width:1"/>
        <path d="M30 56 q-5 3 0 6 q5 3 0 6 q-5 3 0 6 q5 3 0 6" fill="none" style="stroke:#BFB194;stroke-width:1.6"/>
      </g>`
    : '';
  const badgeText = you ? 'YOU' : (c.badge || '');
  return `<svg class="fig" viewBox="0 0 100 120" aria-hidden="true">
    <g class="arm-raise">
      <path d="M68 78 L71 47" stroke-linecap="round" stroke-width="11" style="stroke:${L.suit}"/>
      <rect x="64.5" y="34" width="12" height="14" rx="5" ${f(L.skin)}/>
    </g>
    ${hairBack(L.hairStyle, L.hair)}
    <path d="M10 120 L12.5 90 C12 76 20 68.5 31 66.5 L50 63 L69 66.5 C80 68.5 88 76 87.5 90 L90 120 Z" ${f(L.suit)}/>
    <path d="M13 84 C16 74 22 69 31 67 L33 74 C24 76 18 80 13 84 Z M87 84 C84 74 78 69 69 67 L67 74 C76 76 82 80 87 84 Z" fill="rgba(255,255,255,.08)"/>
    <path d="M40.5 65 L50 93 L59.5 65 Z" ${f(L.shirt)}/>
    ${tie}
    <path d="M40 65 L47.5 82 L43 95 L35.5 70 Z" fill="rgba(0,0,0,.22)"/>
    <path d="M60 65 L52.5 82 L57 95 L64.5 70 Z" fill="rgba(0,0,0,.22)"/>
    <path d="M40.5 65.5 L46.5 99 M59.5 65.5 L53.5 99" fill="none" stroke-width="2.6" style="stroke:var(--side)"/>
    <rect x="42.5" y="98" width="15" height="18" rx="1.2" style="fill:#F6F1E4;stroke:#1B1814;stroke-width:.9"/>
    <rect x="42.5" y="98" width="15" height="5" style="fill:var(--side)"/>
    <text x="50" y="112" text-anchor="middle" class="badge-t">${badgeText}</text>
    <path d="M44 51 L56 51 L57.5 65 L50 71 L42.5 65 Z" ${f(L.skin)}/>
    <g class="head">
      <ellipse cx="50" cy="38" rx="13.6" ry="16" ${f(L.skin)}/>
      <ellipse cx="36.6" cy="40" rx="2.2" ry="3.4" ${f(L.skin)}/>
      <ellipse cx="63.4" cy="40" rx="2.2" ry="3.4" ${f(L.skin)}/>
      ${hairFront(L.hairStyle, L.hair)}
      <circle cx="44.5" cy="39" r="1.45" fill="#1B1814"/>
      <circle cx="55.5" cy="39" r="1.45" fill="#1B1814"/>
      <path d="M42 34.5 L47 34 M53 34 L58 34.5" stroke="#1B1814" stroke-width="1.1" opacity=".55"/>
      ${glasses}
      <path class="mouth-shut" d="M46 47.5 Q50 49.6 54 47.5" fill="none" stroke="#3A2418" stroke-width="1.5" stroke-linecap="round"/>
      <ellipse class="mouth-open" cx="50" cy="48" rx="3.4" ry="3" fill="#3A1D14"/>
    </g>
    ${phone}
  </svg>`;
}

export function sideClass(side) { return `side-${side}`; }
