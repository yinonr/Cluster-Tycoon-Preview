// THE FILL CONFIRMATION: the results-screen share card, drawn on a canvas.
// 1080×1350 (4:5) for feeds. Everything that matters (wordmark, hero, stamp,
// score, reply, url) sits inside the central 1080×1080 square (y 135–1215),
// so a square crop still reads; the ticker tape on top and the fine print at
// the bottom are the only things a crop loses.
//
//   renderCard(data) → Promise<Blob> (PNG)
//   drawCard(ctx, data, w, h)        pure drawing, for tests and previews
//
// Look: warm paper and black ink, one spot color, an oxblood rubber stamp,
// the pink WHILE YOU WERE OUT slip, an amber CRT score. Flat fills keep the
// PNG small. Fonts are the free stand-ins loaded in index.html; family names
// are always quoted (an unquoted 'Jersey 10' silently fails as ctx.font).
//
// Layout: the letterhead and the fill run full width. Under the fill, the
// facts run down the left; the verdict runs down the right (the stamp,
// pressed over the corner of the fill, then the score readout, then Jim's
// slip clipped to the foot of the sheet), with your answer beside the slip.
// The fill shrinks until both columns fit, so long names never collide.

import { BRAND } from '../config.js';
import { makeRng } from '../util.js';

const W = 1080;
const H = 1350;
const X0 = 64;               // body column
const X1 = W - 64;
const CW = X1 - X0;
const BAND_TOP = 104;        // ticker tape (cropped away in a square)
const FOOT_TOP = 1150;       // mahogany desk: url inside the square, fine print below it
const SLIP_BOTTOM = 1204;    // the slip overhangs the sheet onto the desk, still inside the square
const GUTTER = 32;           // between the facts and the verdict column

// Mirrors styles/tokens.css (a canvas can't read the custom properties it needs before fonts load).
const C = {
  paper: '#EFE6D2', ink: '#1B1814', ink2: '#3A342C',
  spot: '#24533F', stamp: '#A8261C', brass: '#B8913F', brassLight: '#DDBC6E', brassDark: '#8A6A28',
  amber: '#FFB547', glass: '#12100D', mahoganyDeep: '#3A1911',
  slip: '#F7CFCB', pen: '#20304F', fine: '#CFC6B5', down: '#FF6B57',
};
const TONE = { spot: C.spot, stamp: C.stamp, ink: C.ink };

const FAM = {
  hl: ['Merriweather', 'Georgia, serif'],
  text: ['News Cycle', '"Arial Narrow", Arial, sans-serif'],
  ui: ['Jersey 10', 'monospace'],
  term: ['VT323', '"Courier New", monospace'],
  dot: ['DotGothic16', 'monospace'],
};
// Every face/weight the card draws with; renderCard waits for these.
const FACES = [['900', 'hl'], ['700', 'hl'], ['italic 400', 'hl'], ['400', 'text'], ['700', 'text'], ['400', 'ui'], ['400', 'term'], ['400', 'dot']];

const fontOf = (spec, size, fam) => `${spec} ${Math.round(size)}px "${FAM[fam][0]}", ${FAM[fam][1]}`;
const setFont = (ctx, spec, size, fam) => { ctx.font = fontOf(spec, size, fam); };
// Card copy is brand copy: the venue is never printed by its full name.
// Whitespace collapses (and invisible joiners go) first, so a tab, a double
// or a no-break space between the two words can't slip past the filter.
const txt = (s) => (s == null ? '' : String(s))
  .replace(/[­​-‍⁠]/g, '').replace(/\s+/g, ' ').trim()
  .replace(/Federal ?Reserve/gi, 'Fed Reserve');
const rad = (deg) => (deg * Math.PI) / 180;

// ---------------------------------------------------------------------------
export async function renderCard(data) {
  await loadFonts(data);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  try {
    drawCard(canvas.getContext('2d'), data, W, H);
    return await toPng(canvas);
  } finally {
    canvas.width = canvas.height = 0;   // hand the bitmap back right away (iOS caps total canvas memory)
  }
}

// Wait for each face with the card's own text (so the right unicode-range
// subsets come down), but never longer than 2.5s: a slow font beats no card.
async function loadFonts(data) {
  const fonts = document.fonts;
  if (!fonts || !fonts.load) return;
  const sample = [
    data.wordmark, data.floorLabel, data.subLabel, data.buyer, data.firm, data.hero, data.rateLine,
    data.timeLine, data.deskNote, data.rating, data.slip?.from, data.slip?.msg, data.slip?.reply,
    data.vs?.line, data.footer, data.url, ...(BRAND.worldLine || []),
    'FILL CONFIRMATION BUYER DESK FLOOR SCORE NEW BEST WHILE YOU WERE OUT FROM PLEASE CALL 0123456789,.·',
  ].map(txt).join(' ');
  let timer;
  const all = Promise.all(FACES.map(([spec, fam]) => fonts.load(`${spec} 40px "${FAM[fam][0]}"`, sample).catch(() => null)));
  await Promise.race([all, new Promise((r) => { timer = setTimeout(r, 2500); })]);
  clearTimeout(timer);
}

function toPng(canvas) {
  return new Promise((resolve, reject) => {
    const viaDataUrl = () => {
      try { resolve(dataUrlToBlob(canvas.toDataURL('image/png'))); } catch (e) { reject(e); }
    };
    if (!canvas.toBlob) { viaDataUrl(); return; }
    try { canvas.toBlob((blob) => (blob ? resolve(blob) : viaDataUrl()), 'image/png'); } catch { viaDataUrl(); }
  });
}

function dataUrlToBlob(url) {
  const [head, body] = url.split(',');
  const bin = window.atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new window.Blob([bytes], { type: head.slice(5).split(';')[0] || 'image/png' });
}

// An offscreen sheet for the stamp (drawCard also runs where there is no document).
function sheet(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

// ---------------------------------------------------------------------------
// Pure drawing in 1080×1350 design units, scaled uniformly into w×h.
export function drawCard(ctx, data, w = W, h = H) {
  const d = {
    floorLabel: txt(data.floorLabel), subLabel: txt(data.subLabel), buyer: txt(data.buyer), firm: txt(data.firm),
    hero: txt(data.hero), rateLine: txt(data.rateLine), timeLine: txt(data.timeLine), deskNote: txt(data.deskNote),
    rating: txt(data.rating).toUpperCase(), tone: TONE[data.ratingTone] || C.stamp,
    score: Number.isFinite(data.score) ? data.score : null, newBest: !!data.newBest,
    slip: data.slip ? { from: txt(data.slip.from), msg: txt(data.slip.msg), reply: txt(data.slip.reply) } : null,
    vs: txt(data.vs?.line), wordmark: txt(data.wordmark || BRAND.wordmark),
    footer: txt(data.footer),
    url: txt(data.url).replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/$/, ''),   // nobody types a query string
  };
  const rng = makeRng(0x5EED);   // same grain and stamp wear on every card

  ctx.save();
  ctx.fillStyle = C.mahoganyDeep;
  ctx.fillRect(0, 0, w, h);
  const k = Math.min(w / W, h / H);
  ctx.translate((w - W * k) / 2, (h - H * k) / 2);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();   // the tape runs off the card's edge, not into the letterbox
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  drawPaper(ctx, rng);
  drawTicker(ctx);
  const ruleY = drawHeader(ctx, d);
  const confBase = drawConfirmation(ctx, d, ruleY + 46);
  const stamp = d.rating ? inkStamp(d, rng) : null;
  const plan = layout(ctx, d, confBase + 32, stamp);

  drawFoot(ctx, d, plan.slip);
  drawHero(ctx, plan.hero);
  drawRows(ctx, plan.rows);
  if (plan.score) drawScore(ctx, d, plan.score);
  if (plan.reply) drawReply(ctx, plan.reply);
  if (plan.slip) drawSlip(ctx, plan.slip);
  if (stamp) pressStamp(ctx, stamp, plan.stampAt);
  ctx.restore();
}

// ---- layout -------------------------------------------------------------------
// The verdict column is stacked bottom-up from the slip; the fill takes the
// largest size that leaves room for it, and for the facts and the reply.
const STAMP_OVER = 36;    // how far the stamp's box may ride above the fill's baseline
const STAMP_BITE = 0.22;  // ...but its frame bites no more than this much of a figure's cap height

function layout(ctx, d, heroTop, stamp) {
  const slip = d.slip ? layoutSlip(ctx, d.slip) : null;
  const score = d.score != null ? layoutScore(ctx, d) : null;
  const verdictLeft = Math.min(stamp ? X1 + 4 - stamp.bw : X1, score ? X1 - score.w : X1, slip ? slip.minX : X1);
  const factsW = verdictLeft - GUTTER - X0;
  const replyW = (slip ? slip.minX : X1) - GUTTER - X0;
  const verdictFloor = slip ? slip.reach - 10 : FOOT_TOP - 30;

  let plan = null;
  for (let size = 216; size >= 110; size -= 4) {
    const hero = layoutHero(ctx, d.hero, heroTop, size);
    const stampTop = hero.base - (stamp ? stampOver(hero, stamp) : STAMP_OVER);
    const scoreTop = stamp ? stampTop + stamp.bh + 12 : hero.base + 40;
    const verdictBottom = score ? scoreTop + score.h : scoreTop;
    const { rows, bottom } = layoutRows(ctx, d, hero.base, hero.desc, factsW);
    const reply = slip ? layoutReply(ctx, slip.reply, bottom, replyW) : null;
    const stampAt = stamp && { cx: X1 + 4 - stamp.bw / 2, cy: stampTop + stamp.bh / 2 };
    plan = { hero, rows, reply, slip, stampAt, score: score && { ...score, x: X1 - score.w, y: scoreTop } };
    if (verdictBottom <= verdictFloor && (!reply || reply.fits)) break;
    if (hero.size < size - 4) size = hero.size + 4;   // already width-bound: step from there
  }
  return plan;
}

// The stamp's top frame climbs to the right (-5deg), so how high it can sit
// depends on where the fill runs under it: over each run of figures (the big
// one, then "/ 512 H100"), the frame at the run's right end may only touch
// the foot of the glyphs, never cross them like a strike-through.
function stampOver(hero, stamp) {
  const t = rad(STAMP_ROT), c = Math.cos(t), s = Math.sin(t);
  const cx = X1 + 4 - stamp.bw / 2;
  const ly = -stamp.h / 2 + stamp.inset;   // the frame's top edge, on the stamp's own sheet
  const lxMax = stamp.w / 2 - stamp.inset;
  const xAt = (lx) => cx + lx * c - ly * s;
  const dropAt = (lx) => stamp.bh / 2 + lx * s + ly * c;   // frame top below the box top
  const runs = [[hero.bigRight, hero.asc]];
  if (hero.rest) runs.push([hero.bigRight + hero.size * hero.gap + hero.restW, hero.restCap]);
  let over = STAMP_OVER;
  for (const [right, cap] of runs) {
    if (right <= xAt(-lxMax)) continue;   // ends before the stamp starts
    const lx = Math.min(lxMax, (right - cx + ly * s) / c);
    over = Math.min(over, dropAt(lx) + cap * STAMP_BITE);
  }
  return over;
}

// ---- ground ---------------------------------------------------------------
function drawPaper(ctx, rng) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, BAND_TOP, W, FOOT_TOP - BAND_TOP);
  // a light fibre grain and a few flecks (flat strokes: gradients bloat the PNG)
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(110, 80, 40, .11)';
  ctx.beginPath();
  for (let i = 0; i < 260; i++) {
    const x = rng.range(0, W), y = rng.range(BAND_TOP + 8, FOOT_TOP - 4), a = rng.range(0, Math.PI), l = rng.range(5, 16);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(80, 55, 25, .16)';
  for (let i = 0; i < 90; i++) ctx.fillRect(rng.range(0, W), rng.range(BAND_TOP + 8, FOOT_TOP - 4), 2, 2);
}

// The tape: the world line running along a black LED ticker, cut at the left
// edge so the punchline always lands whole on the right.
function drawTicker(ctx) {
  ctx.fillStyle = '#100E0B';
  ctx.fillRect(0, 0, W, BAND_TOP);
  ctx.fillStyle = C.brass;
  ctx.fillRect(0, BAND_TOP - 6, W, 6);
  const lines = (BRAND.worldLine || []).map((s) => txt(s).replace(/\.$/, '').toUpperCase());
  if (!lines.length) return;
  setFont(ctx, '400', 32, 'dot');
  const step = (s) => ctx.measureText(s).width + 22 + 44;   // text, gap, arrow, gap
  const run = lines.reduce((sum, s) => sum + step(s), 0);
  const n = Math.ceil((W - 6) / run);
  let x = W - 6 - run * n;
  const y = 64;
  for (let p = 0; p < n; p++) {
    lines.forEach((s, i) => {
      if (x + step(s) > 0) {
        ctx.fillStyle = C.amber;
        ctx.fillText(s, x, y);
        const up = i < lines.length - 1;   // oil ▲, stocks ▲, compute ▼
        triangle(ctx, x + ctx.measureText(s).width + 22 + 10, y - 12, 11, up, up ? C.amber : C.down);
      }
      x += step(s);
    });
  }
}

function triangle(ctx, cx, cy, r, up, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy + (up ? r * 0.8 : -r * 0.8));
  ctx.lineTo(cx + r, cy + (up ? r * 0.8 : -r * 0.8));
  ctx.lineTo(cx, cy + (up ? -r * 0.9 : r * 0.9));
  ctx.closePath();
  ctx.fill();
}

// ---- letterhead -----------------------------------------------------------
function drawHeader(ctx, d) {
  const track = 5;
  fitSize(ctx, d.wordmark, '900', 'hl', 56, 30, CW, track);
  ctx.fillStyle = C.ink;
  drawTracked(ctx, d.wordmark, W / 2, 206, track, 'center');

  // THE FLOOR · T-38 (1984 desktop face, spot color) · 38 days to the bell
  const parts = [];
  if (d.floorLabel) parts.push({ s: d.floorLabel.toUpperCase(), spec: '400', fam: 'ui', size: 40, color: C.spot, track: 2 });
  if (d.subLabel) parts.push({ s: d.subLabel, spec: 'italic 400', fam: 'hl', size: 27, color: C.ink2, track: 0 });
  let total = 0;
  const sep = 40;
  for (const p of parts) { setFont(ctx, p.spec, p.size, p.fam); p.w = trackedWidth(ctx, p.s, p.track); total += p.w; }
  total += sep * Math.max(0, parts.length - 1);
  const scale = Math.min(1, CW / Math.max(total, 1));
  let x = W / 2 - (total * scale) / 2;
  const base = 258;
  parts.forEach((p, i) => {
    setFont(ctx, p.spec, p.size * scale, p.fam);
    ctx.fillStyle = p.color;
    drawTracked(ctx, p.s, x, base, p.track * scale, 'left');
    x += p.w * scale;
    if (i < parts.length - 1) {
      dot(ctx, x + (sep * scale) / 2, base - 11 * scale, 4.5 * scale);
      x += sep * scale;
    }
  });

  // double rule: 4px double ink
  const ry = base + 24;
  ctx.fillStyle = C.ink;
  ctx.fillRect(X0, ry, CW, 3);
  ctx.fillRect(X0, ry + 7, CW, 1.5);
  return ry + 8;
}

function dot(ctx, x, y, r) {
  ctx.fillStyle = C.brass;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// FILL CONFIRMATION · BUYER Yinon Raviv · DESK Raviv Robotics, with the
// names filled in by hand (blue-black italic, as on the coupon). Returns the
// last baseline. Long names shrink a little before they take another line.
function drawConfirmation(ctx, d, top) {
  const label = (s) => ({ s, spec: '700', fam: 'text', size: 23, color: C.ink, track: 3 });
  const value = (s) => ({ s, spec: 'italic 400', fam: 'hl', size: 31, color: C.pen, track: 0 });
  const groups = [[label('FILL CONFIRMATION')]];
  if (d.buyer) groups.push([label('BUYER'), value(d.buyer)]);
  if (d.firm) groups.push([label('DESK'), value(d.firm)]);
  const gap = 12;   // label → value
  const sep = 40;   // between groups, with a brass dot
  const widthOf = (grp, k) => grp.reduce((sum, r, i) => {
    setFont(ctx, r.spec, r.size * k, r.fam);
    return sum + trackedWidth(ctx, r.s, r.track * k) + (i ? gap * k : 0);
  }, 0);
  const flow = (k) => {
    const lines = [[]];
    let lineW = 0;
    for (const g of groups) {
      const gw = widthOf(g, k);
      const add = lines[lines.length - 1].length ? sep * k + gw : gw;
      if (lines[lines.length - 1].length && lineW + add > maxW) { lines.push([g]); lineW = gw; } else { lines[lines.length - 1].push(g); lineW += add; }
    }
    return lines;
  };
  // Never wider than the column (less the italic overhang); down to .84 if that saves a line.
  const maxW = CW - 10;
  let k = Math.min(1, ...groups.map((g) => maxW / widthOf(g, 1)));
  let lines = flow(k);
  for (let t = k - 0.04; t >= 0.84 && lines.length > 1; t -= 0.04) {
    const tight = flow(t);
    if (tight.length < lines.length) { k = t; lines = tight; }
  }
  let y = top;
  const lh = 46 * k;
  lines.forEach((line) => {
    let x = X0;
    line.forEach((g, gi) => {
      if (gi) {
        dot(ctx, x + (sep * k) / 2, y - 8 * k, 4 * k);
        x += sep * k;
      }
      g.forEach((r, i) => {
        if (i) x += gap * k;
        setFont(ctx, r.spec, r.size * k, r.fam);
        ctx.fillStyle = r.color;
        drawTracked(ctx, r.s, x, y, r.track * k, 'left');
        const rw = trackedWidth(ctx, r.s, r.track * k);
        if (r.fam === 'hl') {   // the dotted line it was written on
          ctx.fillStyle = 'rgba(27, 24, 20, .45)';
          for (let dx = 0; dx < rw; dx += 6) ctx.fillRect(x + dx, y + 9 * k, 2.5, 2);
        }
        x += rw;
      });
    });
    y += lh;
  });
  return y - lh;
}

// ---- the fill ---------------------------------------------------------------
// "512 / 512 H100": the first figure huge, the rest riding its baseline at .4.
function layoutHero(ctx, hero, top, maxSize) {
  const m = hero.match(/^(\S+)\s+(.+)$/);
  const big = m ? m[1] : hero;
  const rest = m ? m[2] : '';
  const gap = 0.1;
  let size = maxSize;
  let bw = 0, rw = 0;
  for (; ; size -= 4) {
    setFont(ctx, '900', size, 'hl');
    bw = ctx.measureText(big).width;
    setFont(ctx, '900', size * 0.4, 'hl');
    rw = rest ? ctx.measureText(rest).width + size * gap : 0;
    if (bw + rw <= CW || size <= 72) break;
  }
  const restCap = ctx.measureText('H').actualBoundingBoxAscent || size * 0.4 * 0.74;
  setFont(ctx, '900', size, 'hl');
  const asc = ctx.measureText(big).actualBoundingBoxAscent || size * 0.74;
  const desc = ctx.measureText(big).actualBoundingBoxDescent || 0; // the comma in "1,024" hangs below
  const base = Math.round(top + asc);
  return { big, rest, size, base, bigRight: X0 + bw, restW: rest ? rw - size * gap : 0, gap, asc, desc, restCap };
}

function drawHero(ctx, h) {
  ctx.fillStyle = C.ink;
  setFont(ctx, '900', h.size, 'hl');
  ctx.fillText(h.big, X0, h.base);
  if (h.rest) {
    setFont(ctx, '900', h.size * 0.4, 'hl');
    ctx.fillText(h.rest, h.bigRight + h.size * h.gap, h.base);
  }
}

// The facts under the fill: the rate in the spot color (its comparison set
// small beneath it), the clock, the desk note, the head-to-head.
function layoutRows(ctx, d, heroBase, heroDesc, maxW) {
  const rows = [];
  let y = heroBase;
  const add = (s, spec, fam, max, min, color, before, maxLines = 2) => {
    const { size, lines } = fitLines(ctx, s, spec, fam, max, min, maxW, maxLines, 6);
    // The first row clears whatever hangs below the hero's baseline.
    if (!rows.length) before = Math.max(before, heroDesc + (ctx.measureText(lines[0]).actualBoundingBoxAscent || size * 0.74) + 14);
    const ys = lines.map((_, i) => (y += i ? size * 1.18 : before));
    rows.push({ lines, size, spec, fam, color, ys });
  };
  if (d.rateLine) {
    const [rate, ...vsTarget] = d.rateLine.split(' · ');
    add(rate, '700', 'hl', 54, 34, C.spot, 82, 1);
    if (vsTarget.length) add(vsTarget.join(' · '), '700', 'text', 30, 24, C.ink2, 42);
  }
  if (d.timeLine) add(d.timeLine, '400', 'text', 34, 26, C.ink, d.rateLine ? 52 : 74);
  if (d.deskNote) add(d.deskNote, 'italic 400', 'hl', 30, 24, C.ink2, 46);
  if (d.vs) add(d.vs, '700', 'text', 32, 24, C.ink, 54);
  return { rows, bottom: y };
}

function drawRows(ctx, rows) {
  for (const r of rows) {
    setFont(ctx, r.spec, r.size, r.fam);
    ctx.fillStyle = r.color;
    r.lines.forEach((line, i) => ctx.fillText(line, X0, r.ys[i]));
  }
}

// ---- the score: an amber CRT readout in a brass bezel ------------------------
function layoutScore(ctx, d) {
  const digits = Math.round(d.score).toLocaleString('en-US');
  const maxW = 420;
  const h = 146;
  // FLOOR SCORE and the NEW BEST tag share one row; a wide fallback face
  // (fonts late or blocked) sets them both smaller rather than overlapping.
  const header = (k) => {
    setFont(ctx, '400', 30 * k, 'ui');
    const labelW = trackedWidth(ctx, 'FLOOR SCORE', 3 * k);
    setFont(ctx, '400', 27 * k, 'ui');
    const tagW = d.newBest ? trackedWidth(ctx, 'NEW BEST', 2 * k) + 22 * k : 0;
    return { k, labelW, tagW, w: labelW + (tagW ? tagW + 24 : 0) + 50 };
  };
  let head = header(1);
  for (let k = 0.96; head.w > maxW && k > 0.6; k -= 0.04) head = header(k);
  let digitSize = fitSize(ctx, digits, '400', 'term', 130, 72, maxW - 50);
  const room = h - 20 - 64;   // baseline to the foot of the label row
  const asc = ctx.measureText(digits).actualBoundingBoxAscent;
  if (asc > room) digitSize = fitSize(ctx, digits, '400', 'term', Math.floor((digitSize * room) / asc), 72, maxW - 50);
  const digitsW = ctx.measureText(digits).width;
  return { digits, digitSize, head, w: Math.min(maxW, Math.max(head.w, digitsW + 50, 300)), h };
}

function drawScore(ctx, d, s) {
  const { x, y, w, h } = s;
  ctx.fillStyle = C.brass;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.brassLight;
  ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = C.glass;
  ctx.fillRect(x + 7, y + 7, w - 14, h - 14);

  const { k, tagW } = s.head;
  ctx.fillStyle = C.amber;
  setFont(ctx, '400', 30 * k, 'ui');
  drawTracked(ctx, 'FLOOR SCORE', x + 26, y + 42, 3 * k, 'left');
  if (d.newBest) {
    const tx = x + w - 24 - tagW;
    ctx.fillRect(tx, y + 42 - 23 * k, tagW, 31 * k);
    ctx.fillStyle = C.glass;
    setFont(ctx, '400', 27 * k, 'ui');
    drawTracked(ctx, 'NEW BEST', tx + 11 * k, y + 42, 2 * k, 'left');
  }
  ctx.save();
  ctx.shadowColor = 'rgba(255, 181, 71, .5)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = C.amber;
  setFont(ctx, '400', s.digitSize, 'term');
  ctx.fillText(s.digits, x + 24, y + h - 20);
  ctx.restore();
  // scanlines
  ctx.fillStyle = 'rgba(0, 0, 0, .3)';
  for (let sy = y + 9; sy < y + h - 9; sy += 4) ctx.fillRect(x + 7, sy, w - 14, 1.5);
}

// ---- post-credits: Jim's slip and your answer -------------------------------
const SLIP_W = 392;
const SLIP_ROT = 3;
const CLIP = { x: -10, top: -46, w: 30, h: 92 };   // the paper clip, in slip coordinates

function layoutSlip(ctx, slip) {
  const pad = 22;
  const inner = SLIP_W - pad * 2;
  const msg = fitLines(ctx, slip.msg, 'italic 400', 'hl', 28, 22, inner, 4);
  const from = fitLines(ctx, slip.from, '400', 'text', 24, 18, inner - 64, 1);
  const h = 56 + 38 + 8 + msg.lines.length * msg.size * 1.22 + 16 + 30 + 20;
  // Rotated about its center; tuck its bounding box into the bottom-right corner.
  const t = rad(SLIP_ROT), cos = Math.cos(t), sin = Math.sin(t);
  const ex = (SLIP_W / 2) * cos + (h / 2) * sin;
  const ey = (SLIP_W / 2) * sin + (h / 2) * cos;
  const cx = X1 - 2 - ex;
  const cy = SLIP_BOTTOM - ey;
  // highest point: the top-left corner or the clip's loop (y' = x·sin + y·cos)
  const lift = (lx, ly) => cy + (lx - SLIP_W / 2) * sin + (ly - h / 2) * cos;
  const reach = Math.min(lift(0, 0), lift(CLIP.x + CLIP.w / 2, CLIP.top));
  const minX = Math.min(cx - ex, cx + (CLIP.x - SLIP_W / 2) * cos - (CLIP.top - h / 2) * sin);
  return { ...slip, msgFit: msg, fromFit: from, pad, h, cx, cy, reach, minX };
}

function drawSlip(ctx, s) {
  ctx.save();
  ctx.translate(s.cx, s.cy);
  ctx.rotate(rad(SLIP_ROT));
  ctx.translate(-SLIP_W / 2, -s.h / 2);
  ctx.fillStyle = 'rgba(20, 10, 4, .3)';   // hard drop shadow, no blur
  ctx.fillRect(7, 10, SLIP_W, s.h);
  ctx.fillStyle = C.slip;
  ctx.fillRect(0, 0, SLIP_W, s.h);

  let y = 46;
  ctx.fillStyle = C.ink;
  fitSize(ctx, 'WHILE YOU WERE OUT', '900', 'hl', 25, 18, SLIP_W - 96, 3);
  drawTracked(ctx, 'WHILE YOU WERE OUT', SLIP_W / 2 + 10, y, 3, 'center');
  y += 10;
  ctx.fillRect(s.pad, y, SLIP_W - s.pad * 2, 2);

  y += 38;
  setFont(ctx, '700', 16, 'text');
  drawTracked(ctx, 'FROM', s.pad, y, 2, 'left');
  setFont(ctx, '400', s.fromFit.size, 'text');
  ctx.fillText(s.fromFit.lines[0] || '', s.pad + 64, y);
  ctx.fillStyle = 'rgba(27, 24, 20, .35)';
  ctx.fillRect(s.pad + 60, y + 7, SLIP_W - s.pad * 2 - 60, 1.5);

  y += 8;
  ctx.fillStyle = C.pen;
  setFont(ctx, 'italic 400', s.msgFit.size, 'hl');
  s.msgFit.lines.forEach((line) => { y += s.msgFit.size * 1.22; ctx.fillText(line, s.pad, y); });

  // the two boxes, set smaller rather than off the slip when a wider fallback face stands in
  y += 16 + 26;
  const boxes = 31 * 2 + 24;   // box + gap, twice, and the space between the pair
  const rowW = SLIP_W - s.pad - 14;   // may lean into the right margin, never off the pink
  let track = 2;
  for (let size = 17; ; size--) {
    track = (2 * size) / 17;
    setFont(ctx, '700', size, 'text');
    if (size <= 11 || boxes + trackedWidth(ctx, 'PLEASE CALL', track) + trackedWidth(ctx, 'WILL CALL AGAIN', track) <= rowW) break;
  }
  checkbox(ctx, s.pad, y - 20, 22, true);
  ctx.fillStyle = C.ink;
  drawTracked(ctx, 'PLEASE CALL', s.pad + 31, y - 2, track, 'left');
  const wx = s.pad + 31 + trackedWidth(ctx, 'PLEASE CALL', track) + 24;
  checkbox(ctx, wx, y - 20, 22, false);
  ctx.fillStyle = C.ink;
  drawTracked(ctx, 'WILL CALL AGAIN', wx + 31, y - 2, track, 'left');

  // brass Gem clip over the top-left corner
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.brassDark;
  ctx.lineWidth = 5;
  gemClip(ctx, CLIP.x, CLIP.top, CLIP.w, CLIP.h);
  ctx.strokeStyle = C.brassLight;
  ctx.lineWidth = 2;
  gemClip(ctx, CLIP.x - 1, CLIP.top - 1, CLIP.w, CLIP.h);
  ctx.restore();
}

// Outer loop, inner loop: the classic Gem clip, drawn as one wire.
function gemClip(ctx, x, y, w, h) {
  const r1 = w / 2, r2 = w / 2 - 7;
  ctx.beginPath();
  ctx.moveTo(x + 7, y + h - 24);
  ctx.lineTo(x + 7, y + 18);
  ctx.arc(x + 7 + r2, y + 18, r2, Math.PI, 0);
  ctx.lineTo(x + 7 + r2 * 2, y + h - 10);
  ctx.arc(x + r1, y + h - 10, r1, 0, Math.PI);
  ctx.lineTo(x, y + 10);
  ctx.arc(x + r1, y + 10, r1, Math.PI, 0);
  ctx.lineTo(x + w, y + h - 34);
  ctx.stroke();
}

// A ticked box: the cross is two pen strokes, never a glyph.
function checkbox(ctx, x, y, s, checked) {
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, s, s);
  if (!checked) return;
  ctx.strokeStyle = C.pen;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 2);
  ctx.lineTo(x + s - 1, y + s - 3);
  ctx.moveTo(x + s - 2, y + 1);
  ctx.lineTo(x + 2, y + s - 2);
  ctx.stroke();
}

// Your answer, in the headline italic, set beside the slip and down to the
// desk edge: as big as it can be without touching the facts above it.
const REPLY_BASE = FOOT_TOP - 34;

function layoutReply(ctx, reply, contentBottom, maxW) {
  if (!reply) return null;
  let fit = null;
  for (let max = 100; max >= 44; max -= 4) {
    fit = fitLines(ctx, reply, 'italic 400', 'hl', max, max, maxW, 3);
    const top = REPLY_BASE - (fit.lines.length - 1) * fit.size * 1.1 - fit.size * 0.74;
    if (top - 34 >= contentBottom && fit.lines.every((l) => !l.endsWith('…'))) return { ...fit, fits: true };
  }
  return { ...fitLines(ctx, reply, 'italic 400', 'hl', 44, 36, maxW, 3), fits: false };
}

function drawReply(ctx, r) {
  ctx.fillStyle = C.ink;
  setFont(ctx, 'italic 400', r.size, 'hl');
  r.lines.forEach((line, i) => ctx.fillText(line, X0, REPLY_BASE - (r.lines.length - 1 - i) * r.size * 1.1));
}

// ---- the rubber stamp -------------------------------------------------------
// Inked on its own sheet (one line or two, whichever sets bigger), worn with a
// few hundred knocked-out specks, then pressed at -5deg over the corner of the
// fill with multiply so the figures show through.
const STAMP_ROT = -5;
const STAMP_MAX = { w: 440, h: 166 };

function inkStamp(d, rng) {
  let sc = sheet(8, 8);
  let sx = sc.getContext('2d');
  const track = (s) => s * 0.06;
  const words = d.rating.split(' ');
  const options = [[d.rating]];
  for (let i = 1; i < words.length; i++) options.push([words.slice(0, i).join(' '), words.slice(i).join(' ')]);

  const geom = (lines, size) => {
    setFont(sx, '900', size, 'hl');
    const capH = sx.measureText('H').actualBoundingBoxAscent || size * 0.74;
    const textW = Math.max(...lines.map((l) => trackedWidth(sx, l, track(size))));
    const padX = size * 0.42, padY = size * 0.3, lead = size * 0.32;
    const outer = Math.max(5, size * 0.085), gapB = size * 0.07, innerB = Math.max(2, size * 0.035);
    const frame = outer + gapB + innerB;
    return {
      lines, size, capH, padY, lead, outer, gapB, innerB, frame,
      bw: textW + padX * 2 + frame * 2,
      bh: capH * lines.length + lead * (lines.length - 1) + padY * 2 + frame * 2,
    };
  };
  let best = null;
  for (const lines of options) {
    for (let size = 84; size >= 30; size -= 2) {
      const g = geom(lines, size);
      if (g.bw > STAMP_MAX.w || g.bh > STAMP_MAX.h) continue;
      if (!best || size > best.size + 2) best = g;   // one line unless two sets clearly bigger
      break;
    }
  }
  const g = best || geom([d.rating], 30);

  const m = 6;
  sc = sheet(Math.ceil(g.bw + m * 2), Math.ceil(g.bh + m * 2));
  sx = sc.getContext('2d');
  sx.fillStyle = d.tone;
  sx.strokeStyle = d.tone;
  sx.lineWidth = g.outer;
  roundRect(sx, m + g.outer / 2, m + g.outer / 2, g.bw - g.outer, g.bh - g.outer, g.size * 0.16);
  sx.stroke();
  sx.lineWidth = g.innerB;
  const io = g.outer + g.gapB + g.innerB / 2;
  roundRect(sx, m + io, m + io, g.bw - io * 2, g.bh - io * 2, g.size * 0.08);
  sx.stroke();
  setFont(sx, '900', g.size, 'hl');
  g.lines.forEach((l, i) => {
    drawTracked(sx, l, m + g.bw / 2, m + g.frame + g.padY + g.capH * (i + 1) + g.lead * i, track(g.size), 'center');
  });

  // wear: specks, a dry streak or two, and one lighter corner
  sx.globalCompositeOperation = 'destination-out';
  const n = Math.round((g.bw * g.bh) / 240);
  for (let i = 0; i < n; i++) {
    sx.globalAlpha = rng.range(0.5, 1);
    sx.beginPath();
    sx.arc(rng.range(0, sc.width), rng.range(0, sc.height), rng.range(0.6, 2.6), 0, Math.PI * 2);
    sx.fill();
  }
  sx.globalAlpha = 0.35;
  sx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const yy = rng.range(sc.height * 0.2, sc.height * 0.8);
    sx.beginPath();
    sx.moveTo(0, yy);
    sx.lineTo(sc.width, yy + rng.range(-12, 12));
    sx.stroke();
  }
  sx.globalAlpha = 1;
  const fade = sx.createLinearGradient(0, 0, sc.width, sc.height);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(0.72, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(1, 'rgba(0, 0, 0, .3)');
  sx.fillStyle = fade;
  sx.fillRect(0, 0, sc.width, sc.height);

  // its footprint once turned
  const t = Math.abs(rad(STAMP_ROT));
  return {
    canvas: sc, w: sc.width, h: sc.height, inset: m,
    bw: sc.width * Math.cos(t) + sc.height * Math.sin(t),
    bh: sc.width * Math.sin(t) + sc.height * Math.cos(t),
  };
}

function pressStamp(ctx, st, at) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.93;
  ctx.translate(at.cx, at.cy);
  ctx.rotate(rad(STAMP_ROT));
  ctx.drawImage(st.canvas, -st.canvas.width / 2, -st.canvas.height / 2);
  ctx.restore();
  st.canvas.width = st.canvas.height = 0;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- the desk under the sheet: url and fine print -----------------------------
function drawFoot(ctx, d, slip) {
  ctx.fillStyle = C.mahoganyDeep;
  ctx.fillRect(0, FOOT_TOP, W, H - FOOT_TOP);
  ctx.fillStyle = 'rgba(0, 0, 0, .18)';   // wood grain
  for (let y = FOOT_TOP + 12; y < H; y += 11) ctx.fillRect(0, y, W, 2);
  ctx.fillStyle = C.brass;
  ctx.fillRect(0, FOOT_TOP, W, 6);
  if (d.url) {
    ctx.fillStyle = C.paper;
    const maxW = (slip ? slip.minX : X1) - GUTTER - X0;
    fitSize(ctx, d.url, '900', 'hl', 42, 22, maxW);
    ctx.fillText(clip(ctx, d.url, maxW), X0, FOOT_TOP + 48);   // descenders clear the square's edge
  }
  if (d.footer) {
    ctx.fillStyle = C.fine;
    const { size, lines } = fitLines(ctx, d.footer, '400', 'text', 26, 18, CW, 2);
    lines.forEach((line, i) => ctx.fillText(line, X0, 1262 + i * size * 1.25));
  }
}

// ---- type helpers ---------------------------------------------------------------
// Tracking by hand: ctx.letterSpacing isn't everywhere yet.
function trackedWidth(ctx, s, track) {
  if (!track) return ctx.measureText(s).width;
  let w = 0, n = 0;
  for (const ch of s) { w += ctx.measureText(ch).width; n++; }
  return w + track * Math.max(0, n - 1);
}

function drawTracked(ctx, s, x, y, track, align) {
  ctx.textAlign = 'left';
  const w = trackedWidth(ctx, s, track);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  if (!track) { ctx.fillText(s, cx, y); return; }
  for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + track; }
}

// Largest size (step 2) at which s fits maxW on one line; leaves ctx.font set.
function fitSize(ctx, s, spec, fam, max, min, maxW, track = 0) {
  let size = max;
  for (; size > min; size -= 2) {
    setFont(ctx, spec, size, fam);
    if (trackedWidth(ctx, s, track) <= maxW) return size;
  }
  setFont(ctx, spec, min, fam);
  return min;
}

// Largest size at which s wraps into ≤ maxLines balanced lines no wider than maxW.
// At the floor size, anything still too wide is cut with an ellipsis.
// With shrink, it first gives up to that many px to stay on one line.
function fitLines(ctx, s, spec, fam, max, min, maxW, maxLines, shrink = 0) {
  for (let size = max; size >= Math.max(min, max - shrink); size -= 2) {
    setFont(ctx, spec, size, fam);
    if (ctx.measureText(s).width <= maxW) return { size, lines: [s] };
  }
  for (let size = max; size >= min; size -= 2) {
    setFont(ctx, spec, size, fam);
    const lines = balanceLines(ctx, s, maxW);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { size, lines };
  }
  setFont(ctx, spec, min, fam);
  const wrapped = wrapLines(ctx, s, maxW);
  const lines = wrapped.slice(0, maxLines).map((l) => clip(ctx, l, maxW));
  if (wrapped.length > maxLines) lines[maxLines - 1] = clip(ctx, `${lines[maxLines - 1]}…`, maxW);
  return { size: min, lines };
}

function wrapLines(ctx, s, maxW) {
  if (s.includes(' · ')) {
    const parts = s.split(' · ');
    const lines = [];
    let line = '';
    for (const part of parts) {
      const t = line ? `${line} · ${part}` : part;
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = part; } else line = t;
    }
    lines.push(line);
    if (lines.every((l) => ctx.measureText(l).width <= maxW)) return lines;
  }
  const lines = [];
  let line = '';
  for (const word of s.split(' ').filter(Boolean)) {
    const t = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = word; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// Same line count as a greedy wrap, but with the lines as even as possible.
function balanceLines(ctx, s, maxW) {
  const greedy = wrapLines(ctx, s, maxW);
  if (greedy.length < 2) return greedy;
  let lo = 0, hi = maxW;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(ctx, s, mid).length <= greedy.length) hi = mid; else lo = mid;
  }
  return wrapLines(ctx, s, hi);
}

function clip(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s.replace(/…$/, '');
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
