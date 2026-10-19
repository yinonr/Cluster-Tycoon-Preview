import { SKYLINE, PHONE, FACADE } from './intro-art.js';

const slips = [
  ['PROCUREMENT', 'Need four H100s. Preferably before the heat death of the universe.', 'SOURCE COMPUTE'],
  ['JIM · YOUR BROKER', 'My guy knows a guy. His guy is on another call.', 'CALL THE OTHER GUY'],
  ['DEAL DESK', 'Before we share pricing, please sign the NDA about the NDA.', 'STAMP THE PAPERWORK'],
  ['WHILE YOU WERE OUT', 'Capacity no longer available. Would Q2 next year work?', 'OPEN THE MAGAZINE'],
];
export function introView(step, saved) {
  const action = saved ? 'resume-intro' : 'start';
  const direct = `<div class="intro-direct"><button data-action="${action}" class="quiet">Skip Intro</button><button data-action="${action}" class="primary">${saved ? 'CONTINUE RUN' : 'START TRADING'}</button></div>`;
  if (step >= slips.length) return `<section class="tycoon-ad"><p class="ad-folio">THE COMPUTE CHRONICLE · A BETTER WAY TO DO BUSINESS</p>${FACADE}<h1>No more GPU clusterf---s.</h1><p>Imagine if compute buyers, sellers, and the money were all in one room.</p><p class="ad-promise">A small desk. $65,000. Eighteen rounds to make your fortune.</p><p>Buy capacity. Cut a better deal. Back the next breakout.</p><div class="coupon"><span class="rubber-stamp">ADMIT ONE · BROKER</span><button data-action="${action}" class="primary">${saved ? 'CONTINUE RUN' : 'START TRADING'}</button></div><button data-action="intro-replay">Replay Intro</button></section>`;
  const [from, message, label] = slips[step];
  return `<section class="tycoon-office" aria-label="Your broker office"><div class="intro-window">${SKYLINE}</div><div class="office-heading"><p class="eyebrow">YOUR CORNER OFFICE · SAN FRANCISCO</p><h1>There has to be a better way.</h1></div><div class="intro-desk"><div class="intro-monitor"><div class="crt-title">PROCUREMENT.EXE</div><p>${step ? 'CALLS: ' + step + ' · GPUs SECURED: 0' : 'NEW DESK. BIG PLANS. NO COMPUTE.'}</p><button data-action="intro-next" class="primary">${label}</button></div>${PHONE}<article class="intro-slip" aria-live="polite"><small>${from}</small><p>${message}</p>${step === 2 ? '<span class="rubber-stamp">APPROVAL PENDING</span>' : ''}</article></div>${direct}<p class="intro-caption">${step + 1} / 4 · One broker, too many middlemen.</p></section>`;
}
