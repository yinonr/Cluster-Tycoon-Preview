// V20 The Scale-Up: the bell's integration desk (contract: docs/V10_19_INTEGRATION_CONTRACT.md). One view per
// game, chosen by the engine's record of the bell (g.arcade.integration): Node Tetris (ui/tetris.js), Cable Mania
// (ui/cable.js) and Kernel Snake (ui/kernel.js). The new games share this intro card, grade line, result stamp and
// footer; Node Tetris keeps its own V10.18 view under its new name.
import { esc } from '../util.js';
import { gradeOf, gradeGains } from '../tycoon/founder.js';
import { INTEGRATION, TIERS, integrationKind } from '../tycoon/integration.js';
import { tetrisView } from './tetris.js';
import { cableView } from './cable.js';
import { kernelView } from './kernel.js';

export const button = (action, label, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${label}</button>`;
export const pct = x => `${Math.round(x * 100)}%`;
export const gpuClass = gpu => `g-${String(gpu).toLowerCase()}`;
export const recipeText = r => Object.entries(r || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${esc(k)}`).join(' + ');
const gpusIn = r => Object.values(r || {}).reduce((n, x) => n + (x || 0), 0);

// The two first-time milestones: they come from the company's infrastructure (the first bell at each tier), never
// from the round number. Shown once, on that bell's intro card.
export const MILESTONES = Object.freeze({
  cluster: { kicker: 'First multi-node deployment', text: 'Your company has graduated from provisioning hardware to networking it. Connect every GPU node to the switch. Planning is untimed; TEST NETWORK commits your design.' },
  fleet: { kicker: 'First large distributed deployment', text: 'You now operate a massive, expensive compute fleet. Idle GPUs burn money; the job now is keeping every one of them productive. Steer the work across the fleet, and never let it stall.' },
});

export function integrationView(g, ui = {}, now) {
  const kind = integrationKind(g);
  if (kind === 'cable') return cableView(g, ui, now);
  if (kind === 'kernel') return kernelView(g, ui, now);
  return tetrisView(g, ui, now);
}

// The intro card (before START): the game, the deployment, an optional milestone, one rule, the keys.
export function introCard(g, { kind, rule, keys, manifest = '' }) {
  const rec = g.arcade.integration, T = TIERS.find(t => t.game === kind), state = g.arcade[kind === 'cable' ? 'cable' : 'kernel'];
  const m = rec?.milestone ? MILESTONES[rec.milestone] : null;
  const gpus = gpusIn(state?.recipe);
  return `<div class="tt-overlay tt-intro"><div class="tt-card mat-paper arc-card${m ? ' has-milestone' : ''}">` +
    `<p class="tt-eyebrow">THE BELL · ${esc(T.name.toUpperCase())} · ${esc(T.verb.toUpperCase())}</p>` +
    (m ? `<aside class="arc-milestone"><b>${esc(m.kicker)}</b><span>${esc(m.text)}</span></aside>` : '') +
    `<h3>${esc(T.verb)} ${recipeText(state?.recipe)}</h3>` +
    `<p class="arc-scale">${gpus.toLocaleString('en-US')} GPUs arriving · ${(rec?.scale ?? gpus).toLocaleString('en-US')} at your operating scale · ${esc(T.stage.toLowerCase())}</p>` +
    manifest + `<p class="tt-rule-big">${esc(rule)}</p><p class="tt-keys">${keys}</p></div></div>`;
}

// One line for the grade and the lasting bonus it leaves (previewed from the engine's rule), as Node Tetris shows it.
export function gradeLine(g, builds, out) {
  const grade = gradeOf(out), list = builds.map(id => g.company.builds.find(b => b.id === id)).filter(Boolean), gains = gradeGains(g, grade, list);
  const parts = Object.entries(gains).map(([k, d]) => `+${Math.max(1, Math.round(d * 100))}% ${k === 'readiness' ? 'FRONTIER READINESS' : `${k.toUpperCase()} EFFICIENCY`}`);
  return `<p class="tt-grade grade-${grade.toLowerCase()}"><b>${grade === 'CREW' ? 'CREW' : `GRADE ${grade}`}</b>${parts.length ? `<span>${parts.join(' · ')}</span>` : `<span>${grade === 'C' ? 'no lasting bonus' : 'bonus at its cap'}</span>`}</p>`;
}
export function resultBlock(g, builds, out, { perfectLine, line }) {
  const delayed = 1 - out.efficiency, grade = gradeLine(g, builds, out);
  if (out.skipped) return `<div class="tt-result is-crew" role="status"><strong class="tt-stamp">CREW BASELINE · ${pct(out.efficiency)}</strong>${grade}<p>The crew brought it up: ${pct(delayed)} next bell.</p></div>`;
  if (out.perfect) return `<div class="tt-result is-perfect" role="status"><strong class="tt-stamp">100% INTEGRATED</strong>${grade}<p>${esc(perfectLine)}</p><p class="tt-score">Score ${out.score.toLocaleString('en-US')} · ${out.seconds}s</p></div>`;
  return `<div class="tt-result" role="status"><strong class="tt-stamp">${pct(out.efficiency)} INTEGRATED</strong>${grade}<p>${esc(line)} · ${pct(delayed)} next bell</p><p class="tt-score">Score ${out.score.toLocaleString('en-US')}</p></div>`;
}
// The footer: before START, the crew skip and START; while playing, the game's own controls; after, Continue.
export function footerFor({ out, started, name, controls }) {
  if (out) return button('int-continue', 'Continue <span aria-hidden="true">→</span>', 'class="mat-move rail-commit rail-solo" data-arc-continue data-autofocus aria-label="Continue to the board update"');
  if (!started) return button('int-skip', `Skip<span class="wide"> · crew baseline</span> · ${pct(INTEGRATION.skip)}`, `class="mat-exit rail-quiet tt-skip" aria-label="Skip ${esc(name)}: the integration crew brings ${pct(INTEGRATION.skip)} online now, the rest next bell"`) +
    button('int-start', `Start <span class="wide">${esc(name)} </span><span aria-hidden="true">▶</span>`, `class="mat-move rail-commit" data-autofocus aria-label="Start ${esc(name)}"`);
  return controls;
}
// The online-now meter, shared by the new games' strips (same 55% base and 75% crew marks as Node Tetris).
export function meterHTML(efficiency, label = 'ONLINE NOW') {
  return `<div class="tt-meter" data-arc-meter><small class="tt-cap">${esc(label)}</small><b data-arc-pct>${pct(efficiency)}</b><span class="tt-bar" aria-hidden="true"><i class="tt-bar-base"></i><i class="tt-bar-fill" data-arc-fill style="--v:${efficiency}"></i><i class="tt-bar-skip"></i></span><small class="tt-bar-legend" aria-hidden="true"><span>${pct(INTEGRATION.floor)} base</span><span>skip ${pct(INTEGRATION.skip)}</span></small></div>`;
}
export function say(root, text) { const el = root.querySelector('[data-arc-say], [data-tt-say]'); if (el) el.textContent = text; }
