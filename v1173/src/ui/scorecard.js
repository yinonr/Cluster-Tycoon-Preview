// A self-contained, client-side final receipt. All text comes from the finalized game state.
import { MODEL_NAMES, focusOf } from '../tycoon/founder.js';
import { short, pctOf } from './pit-ledger.js';
export const challengeUrl = (seed, href = location.href) => {
  const u = new URL('./', href);
  u.search = `?seed=${Number(seed) >>> 0}`;
  u.searchParams.set('challenge', '1');
  u.hash = '';
  return u.toString();
};
export const scorecardModel = g => {
  const x = g.arcade.exit;
  if (g.phase !== 'over' || !x) throw Error('A finalized game is required');
  return { name: g.company.name?.trim() || 'My AI Startup', wealth: x.payout, ownership: x.founderPct,
    title: x.title, kind: x.kind, mark: !!x.mark, realized: x.realized ?? (x.mark ? 0 : x.payout),
    retained: x.retained ?? (x.mark ? x.payout : 0), focus: focusOf(g.company),
    model: MODEL_NAMES[g.company.level], seed: g.seed, rounds: g.arcade.history.length };
};
const fit = (ctx, value, max, initial = 56) => {
  let size = initial;
  while (size > 23) { ctx.font = `bold ${size}px Georgia, serif`; if (ctx.measureText(value).width <= max) break; size--; }
  return size;
};
export function scorecardCanvas(g) {
  const m = scorecardModel(g), canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const c = canvas.getContext('2d'); if (!c) throw Error('Canvas unavailable');
  c.fillStyle = '#10291f'; c.fillRect(0,0,1200,630);
  c.strokeStyle = '#b89b58'; c.lineWidth = 5; c.strokeRect(26,26,1148,578);
  c.fillStyle = '#183d2e'; c.fillRect(46,46,1108,538);
  c.fillStyle = '#d9bf78'; c.fillRect(46,132,1108,2); c.fillRect(46,438,1108,2);
  c.fillStyle = '#f2e8cb'; c.font = 'bold 31px Georgia, serif'; c.fillText('CLUSTER TYCOON',78,98);
  c.fillStyle = '#d9bf78'; c.font = 'bold 17px monospace'; c.fillText('HAIGHT STREET COMPUTE  /  FINAL RECEIPT',650,94);
  c.fillStyle = '#e8d5aa'; c.font = 'bold 18px monospace'; c.fillText('FOUNDER WEALTH',80,184);
  const amount = m.wealth >= 1e8 ? short(m.wealth) : '$'+(m.wealth/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  c.fillStyle = m.kind === 'shutdown' ? '#f0a491' : '#fff2c5';
  let size=116; while(size>52){c.font=`bold ${size}px Georgia, serif`;if(c.measureText(amount).width<1020)break;size--;}c.fillText(amount,74,312);
  c.fillStyle = '#ddc68d'; c.font = `bold ${fit(c,m.name,1030,47)}px Georgia, serif`;
  let name=m.name; while(name.length>1 && c.measureText(name).width>1030) name=name.slice(0,-2)+'…';
  c.fillText(name,80,385);
  c.fillStyle = '#f5ecd6'; c.font = 'bold 19px monospace';
  const outcome = (m.title || m.kind).toUpperCase(); c.fillText(outcome.length>44?outcome.slice(0,43)+'…':outcome,80,420);
  const rows=[`OWNERSHIP  ${pctOf(m.ownership)}`,`FOCUS  ${m.focus.toUpperCase()}`,`MODEL  ${m.model.toUpperCase()}`,`SEED  ${m.seed}  /  ${m.rounds} ROUNDS`];
  c.font='bold 17px monospace';rows.forEach((v,i)=>c.fillText(v,80+(i%2)*540,477+Math.floor(i/2)*34));
  c.fillStyle='#d9bf78'; c.fillRect(46,540,1108,2);c.font='bold 22px monospace';c.fillText('CAN YOU BUILD A BIGGER FORTUNE?',80,577);
  c.font='15px monospace';c.fillText(m.retained>0 ? `PAPER EQUITY ${short(m.retained)}  ·  CASH PROCEEDS ${short(m.realized)}` : `CASH PROCEEDS ${short(m.realized)}`,625,577);
  return canvas;
}
export const scorecardDataUrl = g => scorecardCanvas(g).toDataURL('image/png');
export function scorecardFile(g) {
  const data = atob(scorecardDataUrl(g).split(',')[1]), bytes = new Uint8Array(data.length);
  for (let i=0;i<data.length;i++) bytes[i]=data.charCodeAt(i);
  return new File([bytes],`cluster-tycoon-seed-${g.seed}.png`,{type:'image/png'});
}
export const scoreMillions = cents => `$${(cents/100000000).toLocaleString('en-US',{maximumFractionDigits:cents<100000000?8:2})}M`;
export function shareCopy(g, href) {
  const m=scorecardModel(g),url=challengeUrl(m.seed, href),score=scoreMillions(m.wealth);
  return {url,caption:`I exited with ${score} on Cluster Tycoon, a GPU live trading game. ${url}`};
}
