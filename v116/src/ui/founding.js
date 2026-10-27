import { esc } from '../util.js';
import { gchip } from './pit-company.js';
import { cardState, openCards } from '../tycoon/founder.js';
import { nameError } from '../tycoon/startup-name.js';

export const GUIDE_KEY = 'hsc-tycoon-v116-guidance';
export const TIPS = {
  objective: ['BUY GPUs', 'Match your project.'],
  supplier: ['CHARM', 'For a better price.'],
  ready: ['FILL SLOTS', 'Then BUILD.'],
  vc: ['INVESTORS', 'Cash now. Less ownership.'],
  tetris: ['FIT THE GPUs', 'Better fit, faster integration.'],
  deal: ['PRIVATE OFFER', 'Check the deadline and risk.'],
};
export function guidePreferences(storage) {
  let data = {};
  try { data = JSON.parse(storage.getItem(GUIDE_KEY)) || {}; } catch { /* session-only fallback */ }
  const prefs = { intro: data.intro === true, founded: data.founded === true, seen: new Set(Array.isArray(data.seen) ? data.seen.filter(k => k in TIPS) : []) };
  prefs.save = () => { try { storage.setItem(GUIDE_KEY, JSON.stringify({ intro: prefs.intro, founded: prefs.founded, seen: [...prefs.seen] })); } catch { /* do not block an otherwise playable session */ } };
  return prefs;
}
export function nextTip(g, ui, prefs) {
  if (!g || ui.entry || ui.guide || g.phase === 'over' || g.arcade.signing) return null;
  const unseen = k => !prefs.seen.has(k);
  if (g.phase === 'integration') return unseen('tetris') ? 'tetris' : null;
  if (g.phase !== 'floor') return null;
  if (g.arcade.active && unseen('supplier')) return 'supplier';
  if (g.arcade.confirm?.termId && unseen('vc')) return 'vc';
  if (g.arcade.confirm?.scenario && unseen('deal')) return 'deal';
  if (unseen('ready') && !g.arcade.active && !g.arcade.confirm?.termId && openCards(g).some(o => {
    const s = cardState(g, o); return s.live && s.rows.every(r => r.held + r.free >= r.need);
  })) return 'ready';
  if (g.q === 1 && !g.arcade.purchases.length && !g.arcade.active && !g.arcade.confirm && unseen('objective')) return 'objective';
  return null;
}
export function hintView(key) {
  const tip = TIPS[key];
  return tip ? `<aside class="context-hint" role="status" data-tip="${key}"><span><b>${tip[0]}</b> ${tip[1]}</span><button type="button" data-action="hint-dismiss" aria-label="Dismiss hint" title="Dismiss hint">&#215;</button></aside>` : '';
}
const steps = () => `<ol class="founding-steps">
  <li class="step-product">${gchip('H100')}<div><b>1. PICK WHAT TO BUILD</b><p>Choose from Product, Research, and Infrastructure projects. Each needs different GPUs.</p></div></li>
  <li class="step-compute">${gchip('H200')}<div><b>2. BUY COMPUTE</b><p>Find suppliers, negotiate prices, and get the GPUs you need.</p></div></li>
  <li class="step-company">${gchip('B200')}<div><b>3. BUILD YOUR COMPANY</b><p>Complete projects, raise VC money when you need it, and protect your ownership.</p></div></li>
</ol>`;
export function foundingView(ui, prefs, g) {
  const tip = ui.guide && TIPS[ui.guide];
  if (tip) return `<div class="founding-scrim is-tip"><section class="founding-dialog tip-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title" tabindex="-1" data-tip="${ui.guide}"><p class="founding-kicker" id="guide-title">${tip[0]}</p><p class="tip-copy">${esc(tip[1])}</p><button type="button" data-action="guide-dismiss" data-autofocus>Got it <span aria-hidden="true">&#8594;</span></button></section></div>`;
  const naming = ui.entry === 'found' || ui.guide === 'rename', edit = ui.guide === 'rename', help = ui.guide === 'help';
  const showSteps = help || !edit && ui.showInstructions;
  return `<div class="founding-scrim"><section class="founding-dialog" role="dialog" aria-modal="true" aria-labelledby="founding-title" tabindex="-1">
    <header><p class="founding-kicker">HAIGHT STREET COMPUTE <span>V10.16</span></p><h1 id="founding-title">${edit ? 'Name your startup' : 'Cluster Tycoon'}</h1>
    ${edit ? '' : '<p class="founding-lead">10 rounds. One AI startup. Get rich.<br>Buy GPUs. Build products. Grow your company.</p>'}</header>
    ${naming ? `<form id="startup-form" novalidate><label for="startup-name">NAME YOUR STARTUP</label><input id="startup-name" name="startup" type="text" maxlength="64" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="go" placeholder="Enter your startup's name" value="${esc(ui.nameDraft || '')}" aria-describedby="name-error" data-autofocus><p id="name-error" class="name-error" aria-live="polite"></p></form>` : ''}
    ${showSteps ? `<section class="founding-how"><h2>How to Play</h2>${steps()}<p class="founding-goal"><b>THE GOAL:</b> Finish with the most valuable founder stake.</p></section>` : ''}
    <footer>${naming ? `<button type="submit" form="startup-form" class="founding-primary" ${nameError(ui.nameDraft) ? 'disabled' : ''}>${edit ? 'SAVE NAME' : 'START'} <span aria-hidden="true">&#8594;</span></button>` : '<button type="button" class="founding-primary" data-action="guide-close" data-autofocus>BACK TO MY COMPANY &#8594;</button>'}
    <div class="founding-links">${!edit && !help && !showSteps ? '<button type="button" data-action="guide-instructions">How to Play</button>' : ''}${!edit ? '<button type="button" data-action="intro-replay">Replay Intro</button>' : ''}${help ? '<button type="button" data-action="rename-startup">Edit startup name</button>' : ''}${g && !help ? '<button type="button" data-action="guide-close">Cancel</button>' : ''}</div></footer>
  </section></div>`;
}
