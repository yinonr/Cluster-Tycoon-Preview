import { V7 } from '../tycoon/arcade.js';
import { esc } from '../util.js';
import { MOONSHOT } from '../tycoon/moonshot.js';
import { money, short } from './pit-ledger.js';

export function moonshotStatus(g) {
  const i = g.world.institutional, m = i?.moonshot, f = i?.fund;
  if (!m && f?.state !== 'signed') return '';
  return `<p class="strategic-status frontier-status">${m ? `<button type="button" data-action="review-moonshot" class="mat-exit">${m.state==='offered'?`Moonshot opportunity · ${short(MOONSHOT.cluster.cash+MOONSHOT.training.cash)} + GPUs`:`Moonshot · ${esc(m.outcome || m.state.replaceAll('-', ' '))}`} </button>` : ''}${f?.state === 'signed' ? `<span>Aster: ${f.milestone === 'pending' ? `due R${f.due}` : esc(f.milestone)}</span>` : ''}</p>`;
}
export function moonshotView(g) {
  const m = g.world.institutional.moonshot, offered = m.state === 'offered';
  const recipe = r => Object.entries(r).map(([gpu, n]) => `${n} ${gpu}`).join(' + ');
  const busy = g.company.builds.some(b => b.q === g.q && b.lane === 'research');
  return { title: 'Frontier Moonshot', role: 'card', desk: 'paper', exit: null,
    body: `<div class="desk-center"><article class="paper-sheet mat-paper frontier-proposal"><header class="contract-head"><span>FRONTIER PROGRAM</span><span>${offered ? 'PROPOSAL' : esc(m.outcome || m.state).toUpperCase()}</span></header><h3>Frontier Moonshot</h3><p class="frontier-capital">${money(MOONSHOT.cluster.cash + MOONSHOT.training.cash)}</p><dl><dt>1. Assemble</dt><dd>${recipe(MOONSHOT.cluster.recipe)} · ${money(MOONSHOT.cluster.cash)}</dd><dt>2. Train</dt><dd>${recipe(MOONSHOT.training.recipe)} · ${money(MOONSHOT.training.cash)}</dd></dl></article></div>`,
    footer: `<button type="button" data-action="close-focus" class="mat-exit rail-quiet">Back to the floor</button>${offered ? `<button type="button" data-action="decline-moonshot" class="mat-exit rail-quiet">Decline</button><button type="button" data-action="accept-moonshot" class="mat-vault rail-commit" ${busy || g.q >= V7.rounds ? 'disabled' : ''}>Accept Moonshot · ${short(MOONSHOT.cluster.cash + MOONSHOT.training.cash)} + GPUs</button>` : ''}` };
}
