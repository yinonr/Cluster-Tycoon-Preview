import { esc } from '../util.js';

// V22.5.2: the frontier run lives in Projects. Only the sovereign fund's milestone status remains here.
export function moonshotStatus(g) {
  const f = g.world.institutional?.fund;
  if (f?.state !== 'signed') return '';
  return `<p class="strategic-status frontier-status"><span>Aster: ${f.milestone === 'pending' ? `due R${f.due}` : esc(f.milestone)}</span></p>`;
}
