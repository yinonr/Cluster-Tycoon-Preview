// Traders in 80s business wardrobe, drawn as a 1-bit Macintosh game would draw them (HSC design pass): ink outlines
// on paper, clothes and hair in MacPaint patterns, faces and hands in clean solid tones (never dithered). Power shoulders, pinstripes and houndstooth, loud
// patterned ties, a lanyard and badge. Fills go through style="fill:…" so a look can pass a colour or a pattern
// (url(#hsc-f-…), defined once per page by FIGURE_DEFS).

const INK = '#161514', PAPER = '#F8F7F5';
const f = (c) => `style="fill:${c}"`;
const O = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"`;

// The figure patterns, in the figure's own 100×120 units. Injected once into the page (see pit.js boot).
export const FIGURE_DEFS = `<svg class="hsc-figure-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">
  <defs>
    <pattern id="hsc-f-p12" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${PAPER}"/><rect width="1.5" height="1.5" fill="${INK}"/><rect x="3" y="3" width="1.5" height="1.5" fill="${INK}"/></pattern>
    <pattern id="hsc-f-p25" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="${PAPER}"/><rect width="1.5" height="1.5" fill="${INK}"/></pattern>
    <pattern id="hsc-f-p50" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="${PAPER}"/><rect width="1.5" height="1.5" fill="${INK}"/><rect x="1.5" y="1.5" width="1.5" height="1.5" fill="${INK}"/></pattern>
    <pattern id="hsc-f-p75" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="${INK}"/><rect width="1.5" height="1.5" fill="${PAPER}"/></pattern>
    <pattern id="hsc-f-pin" width="4.5" height="4" patternUnits="userSpaceOnUse"><rect width="4.5" height="4" fill="${INK}"/><rect width=".9" height="4" fill="${PAPER}"/></pattern>
    <pattern id="hsc-f-chalk" width="4.5" height="4" patternUnits="userSpaceOnUse"><rect width="4.5" height="4" fill="${PAPER}"/><rect width="1.2" height="4" fill="${INK}"/></pattern>
    <pattern id="hsc-f-check" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="${PAPER}"/><rect width="7" height="1.4" fill="${INK}"/><rect width="1.4" height="7" fill="${INK}"/><rect x="3.5" y="3.5" width="1" height="1" fill="${INK}"/></pattern>
    <pattern id="hsc-f-hound" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${PAPER}"/><path d="M0 0h3v3H0zM3 3h3v3H3zM3 1.5h1.5V3H3zM1.5 3H3v1.5H1.5z" fill="${INK}"/></pattern>
    <pattern id="hsc-f-hatch" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${PAPER}"/><path d="M0 4L4 0M-1 1L1 -1M3 5L5 3" stroke="${INK}" stroke-width="1.4"/></pattern>
    <pattern id="hsc-f-stripe" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="4" height="4" fill="${INK}"/><rect width="1.6" height="4" fill="${PAPER}"/></pattern>
    <pattern id="hsc-f-dots" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${INK}"/><circle cx="2" cy="2" r=".9" fill="${PAPER}"/></pattern>
    <pattern id="hsc-f-shirt" width="3.2" height="3" patternUnits="userSpaceOnUse"><rect width="3.2" height="3" fill="${PAPER}"/><rect width=".7" height="3" fill="${INK}"/></pattern>
  </defs>
</svg>`;

function hairBack(style, color) {
  switch (style) {
    case 'bighair': return `<path d="M50 14 C64 14 72 25 72 37 C72 46 69 55 69 58 C60 63 40 63 31 58 C31 55 28 46 28 37 C28 25 36 14 50 14 Z" ${f(color)} ${O}/>`;
    case 'bob': return `<path d="M33 34 C33 20 42 16 50 16 C58 16 67 20 67 34 L68 55 C62 58 38 58 32 55 Z" ${f(color)} ${O}/>`;
    case 'curly': return `<g ${f(color)} ${O}><circle cx="38" cy="28" r="7"/><circle cx="50" cy="23" r="8"/><circle cx="62" cy="28" r="7"/><circle cx="35" cy="37" r="5"/><circle cx="65" cy="37" r="5"/></g>`;
    default: return '';
  }
}

function hairFront(style, color) {
  switch (style) {
    case 'slick': return `<path d="M36.4 37 C35.6 22 43 18.5 50 18.5 C58 18.5 64.6 22.5 63.8 37 C61 28.5 56 26 50 26 C44 26 39.5 29 36.4 37 Z" ${f(color)} ${O}/>`;
    case 'short': return `<path d="M36.5 35 C36 22 43 19 50 19 C58 19 64.5 22 63.8 35 C60 31 57 27.5 52 28.5 C47 26.5 41 30 36.5 35 Z" ${f(color)} ${O}/>`;
    case 'bighair': return `<path d="M35 36 C34 20 44 17 50 17 C58 17 66 21 65 36 C60 27 55 25 47 27 C42 28 38 31 35 36 Z" ${f(color)} ${O}/>`;
    case 'bob': return `<path d="M36 33 C37 23 44 20 50 20 C57 20 63 23 64 33 C58 28 42 28 36 33 Z" ${f(color)} ${O}/>`;
    case 'curly': return '';
    case 'bald': return `<path d="M36.6 40 C36.2 35 37 33 38 32 L38.5 41 Z M63.4 40 C63.8 35 63 33 62 32 L61.5 41 Z" ${f(color)} ${O}/>`;
    default: return '';
  }
}

// A limb is a thick stroke: an ink stroke underneath outlines it.
const limb = (d, fill, w = 11) => `<path d="${d}" stroke-linecap="round" stroke-width="${w + 3}" fill="none" style="stroke:${INK}"/><path d="${d}" stroke-linecap="round" stroke-width="${w}" fill="none" style="stroke:${fill}"/>`;

export function figureSVG(c, { you = false } = {}) {
  const L = c.look;
  const tie = L.tie ? `<path d="M48 67.5 L52 67.5 L54.2 88 L50 94 L45.8 88 Z" ${f(L.tie)} ${O}/><path d="M47.6 67 L52.4 67 L51.4 71 L48.6 71 Z" ${f(L.tie)} ${O}/>` : '';
  const glasses = L.glasses
    ? `<g fill="none" stroke="${INK}" stroke-width="1.6"><rect x="39.5" y="35" width="9" height="7.5" rx="2.4" fill="${PAPER}" fill-opacity=".55"/><rect x="51.5" y="35" width="9" height="7.5" rx="2.4" fill="${PAPER}" fill-opacity=".55"/><path d="M48.5 38 L51.5 38"/></g>`
    : '';
  const phone = L.phone
    ? `<g class="phone-arm">
        ${limb('M29 78 C26 66 28 56 33 50', L.suit)}
        <circle cx="34" cy="47" r="5.5" ${f(L.skin)} ${O}/>
        <rect x="27.5" y="31" width="9" height="25" rx="4.5" transform="rotate(-14 32 43)" style="fill:${PAPER};stroke:${INK};stroke-width:1.5"/>
        <path d="M30 56 q-5 3 0 6 q5 3 0 6 q-5 3 0 6 q5 3 0 6" fill="none" style="stroke:${INK};stroke-width:1.4"/>
      </g>`
    : '';
  const badgeText = you ? 'YOU' : (c.badge || '');
  // Optional pose parts. Both stay hidden until CSS shows them for a real state:
  // a raised bidding paddle (the floor's one relevance cue) and crossed arms (a mood).
  const paddle = L.paddle
    ? `<g class="paddle"><path d="M70.6 46 L70.6 23" stroke-linecap="round" stroke-width="2.6" style="stroke:${INK}"/><ellipse cx="70.6" cy="14.5" rx="10" ry="10.5" style="fill:${INK}"/><ellipse cx="70.6" cy="14.5" rx="6.6" ry="7" style="fill:${PAPER}"/></g>`
    : '';
  const crossed = `<g class="arms-crossed">${limb('M22 96 C30 84 52 80 73 86', L.suit, 10.5)}${limb('M78 96 C70 84 48 80 27 86', L.suit, 10.5)}<circle cx="75" cy="86" r="4.6" ${f(L.skin)} ${O}/><circle cx="25" cy="86" r="4.6" ${f(L.skin)} ${O}/></g>`;
  const eye = (x) => `<circle cx="${x}" cy="39" r="2.1" fill="${PAPER}"/><circle cx="${x}" cy="39" r="1.5" fill="${INK}"/>`;
  return `<svg class="fig" viewBox="0 0 100 120" aria-hidden="true">
    <g class="arm-raise${L.paddle ? ' has-paddle' : ''}">
      ${paddle}
      ${limb('M68 78 L71 47', L.suit)}
      <rect x="64.5" y="34" width="12" height="14" rx="5" ${f(L.skin)} ${O}/>
    </g>
    ${hairBack(L.hairStyle, L.hair)}
    <path d="M10 120 L12.5 90 C12 76 20 68.5 31 66.5 L50 63 L69 66.5 C80 68.5 88 76 87.5 90 L90 120 Z" ${f(L.suit)} ${O}/>
    <path d="M40.5 65 L50 93 L59.5 65 Z" ${f(L.shirt)} ${O}/>
    ${tie}
    <path d="M40 65 L47.5 82 L43 95 L35.5 70 Z" ${f(L.suit)} ${O}/>
    <path d="M60 65 L52.5 82 L57 95 L64.5 70 Z" ${f(L.suit)} ${O}/>
    <path d="M40.5 65.5 L46.5 99 M59.5 65.5 L53.5 99" fill="none" stroke-width="2.4" style="stroke:${INK}"/>
    <rect x="42.5" y="98" width="15" height="18" rx="1.2" style="fill:${PAPER};stroke:${INK};stroke-width:1.2"/>
    <rect x="42.5" y="98" width="15" height="5" style="fill:${INK}"/>
    <text x="50" y="112" text-anchor="middle" class="badge-t">${badgeText}</text>
    <path d="M44 51 L56 51 L57.5 65 L50 71 L42.5 65 Z" ${f(L.skin)} ${O}/>
    <g class="head">
      <ellipse cx="36.6" cy="40" rx="2.2" ry="3.4" ${f(L.skin)} ${O}/>
      <ellipse cx="63.4" cy="40" rx="2.2" ry="3.4" ${f(L.skin)} ${O}/>
      <ellipse cx="50" cy="38" rx="13.6" ry="16" ${f(L.skin)} ${O}/>
      ${hairFront(L.hairStyle, L.hair)}
      ${eye(44.5)}${eye(55.5)}
      <path d="M50.2 39.5 Q48.4 43.6 50.6 44.2" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>
      <path class="brow brow-l" d="M42 34.5 L47 34" stroke="${INK}" stroke-width="1.4"/><path class="brow brow-r" d="M53 34 L58 34.5" stroke="${INK}" stroke-width="1.4"/>
      ${glasses}
      <path class="mouth-shut" d="M46 47.5 Q50 49.6 54 47.5" fill="none" stroke="${PAPER}" stroke-width="3.2" stroke-linecap="round"/>
      <path class="mouth-shut" d="M46 47.5 Q50 49.6 54 47.5" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
      <ellipse class="mouth-open" cx="50" cy="48" rx="3.4" ry="3" fill="${INK}" stroke="${PAPER}" stroke-width="1"/>
    </g>
    ${crossed}
    ${phone}
  </svg>`;
}

export function sideClass(side) { return `side-${side}`; }
