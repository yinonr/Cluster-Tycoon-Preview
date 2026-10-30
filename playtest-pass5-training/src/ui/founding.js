import { baburSays, selectBaburExpression } from './babur.js';
import { V7 } from '../tycoon/arcade.js';
import { esc } from '../util.js';
import { gchip } from './pit-company.js';
import { cardState, openCards } from '../tycoon/founder.js';
import { nameError } from '../tycoon/startup-name.js';

export const GUIDE_KEY = `${V7.key}-guidance`;
export const TIPS = {
  objective: ['BUY GPUs', 'Match your project.'],
  supplier: ['CHARM', 'For a better price.'],
  ready: ['FILL SLOTS', 'Then BUILD.'],
  vc: ['INVESTORS', 'Cash now. Less ownership.'],
  tetris: ['FIT THE GPUs', 'Better fit, faster integration.'],
  cable: ['CABLE THE NODES', 'Connect every GPU node. Plan freely, then TEST NETWORK.'],
  kernel: ['RUN THE FLEET', 'Every job, no stalls.'],
  deal: ['PRIVATE OFFER', 'Check the deadline and risk.'],
};
export function guidePreferences(storage) {
  let data = {};
  try { data = JSON.parse(storage.getItem(GUIDE_KEY)) || {}; } catch { /* session-only fallback */ }
  // V10.18: the opening's SOUND and MOTION switches are remembered (undefined: not chosen yet).
  const pick = v => (typeof v === 'boolean' ? v : undefined);
  const prefs = { intro: data.intro === true, founded: data.founded === true, welcome: data.welcome === true, sound: pick(data.sound), motion: pick(data.motion), seen: new Set(Array.isArray(data.seen) ? data.seen.filter(k => k in TIPS) : []) };
  prefs.save = () => { try { storage.setItem(GUIDE_KEY, JSON.stringify({ intro: prefs.intro, founded: prefs.founded, welcome: prefs.welcome, sound: prefs.sound, motion: prefs.motion, seen: [...prefs.seen] })); } catch { /* do not block an otherwise playable session */ } };
  return prefs;
}
export function nextTip(g, ui, prefs) {
  if (!g || ui.entry || ui.guide || g.phase === 'over' || g.arcade.signing) return null;
  const unseen = k => !prefs.seen.has(k);
  if (g.phase === 'integration') { const k = ({ cable: 'cable', kernel: 'kernel' })[g.arcade.integration?.kind] || 'tetris'; return unseen(k) ? k : null; }
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
  if (ui.guide === 'help') return `<div class="founding-scrim"><section class="founding-dialog pass5-help" role="dialog" aria-modal="true" aria-labelledby="help-title" tabindex="-1"><h1 id="help-title">Ask Babur</h1>${baburSays(ui.training ? 'One step at a time. Your practice money and hardware stay in this lesson.' : 'Pick a task. Its empty GPU tiles highlight matching floor offers. Fill the task with your GPUs, then build.',{expression:selectBaburExpression(ui.training,{context:'help'})})}<div class="help-notes"><p>Charm can change a quote. Review the GPU type, quantity and total before you sign a contract.</p><p>Node Tetris places hardware; Cable Mania connects it. In a main round, integration determines how much of your build comes online.</p>${ui.training ? '<p>There is no countdown here. Mistakes can be retried for free.</p>' : '<p>Funding trades ownership for company cash. Review both numbers before accepting.</p><p>Each company starts with minigames locked. Real builds earn access; play between rounds from the board update. Prizes pay only improvements to your best result for the completed round. Buyers handles resale; Suppliers shows all offers.</p><p>The round clock pauses while you inspect an offer or view. End round is beside the current task.</p>'}</div><footer><button type="button" class="founding-primary" data-action="guide-close" data-autofocus>Back to ${ui.training ? 'training' : 'company'} →</button>${!ui.training ? '<div class="founding-links"><button type="button" data-action="replay-training">Replay training</button><button type="button" data-action="rename-startup">Edit startup name</button></div>' : ''}</footer></section></div>`;

  if (ui.entry === 'welcome' || ui.guide === 'help') return `<div class="founding-scrim"><section class="founding-dialog welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title" tabindex="-1">
    <div class="welcome-content" tabindex="0" aria-label="Welcome guide. Scroll to read all three steps.">
    <header><p class="founding-kicker">CLUSTER TYCOON · V20</p><h1 id="welcome-title">WELCOME TO THE HAIGHT STREET COMPUTE MARKET!</h1>
    <p class="welcome-subtitle">5 rounds. One AI startup. Get the bag.</p>
    </header>
    <ol class="welcome-panels" aria-label="Your game loop">
      <li class="welcome-panel" tabindex="0" aria-labelledby="welcome-buy">
        <h2 id="welcome-buy">1. BUY AND SELL GPUs</h2>
        <img src="./assets/welcome/market.webp" width="720" height="450" alt="GPU suppliers on the trading floor, with chip quantities and asking prices." decoding="async">
        <p>Each round, you have <strong>45 seconds</strong> on the trading floor to buy GPUs from suppliers or sell your extras to buyers.</p><p>Click on a task to quickly find the suppliers with the chips you need. Use your <strong>Charm</strong> to negotiate better deals.</p>
      </li>
      <li class="welcome-panel" tabindex="0" aria-labelledby="welcome-build">
        <h2 id="welcome-build">2. BUILD YOUR COMPANY</h2>
        <img src="./assets/welcome/build.webp" width="720" height="450" alt="A product project showing required GPUs and the build controls." decoding="async">
        <p>Use your GPUs to <strong>launch products, train AI models, and make money.</strong> Build a rack early for free GPUs now and each later round. As your company grows, fewer, larger supply lots arrive. Investment in rounds two and three buys room to expand; you keep less of the final company.</p><p>You can raise investment to grow faster, but be careful how much of your company you give away.</p>
      </li>
      <li class="welcome-panel" tabindex="0" aria-labelledby="welcome-integrate">
        <h2 id="welcome-integrate">3. GET YOUR GPUs RUNNING</h2>
        <img src="./assets/welcome/integration.webp" width="720" height="450" alt="Cable Mania: connect GPU nodes to power and networking, then test your network." decoding="async">
        <p>At the end of each round, you’ll play a short <strong>integration minigame</strong> to connect your GPUs with power and networking.</p><p>The better you do, the better your GPUs perform — and the more your company can earn. Once unlocked, games are free to replay between rounds from the board update. Node Tetris and Cable Mania pay only improvements to your best prize for the completed round.</p>
      </li>
    </ol>
    <p class="welcome-goal">After round 5, the game ends. Your score is your <strong>founder wealth:</strong> your retained share of the company’s operating value and cash.</p>
    </div>
    <footer><button type="button" class="founding-primary" data-action="${ui.entry === 'welcome' ? 'enter-floor' : 'guide-close'}" data-autofocus>${ui.entry === 'welcome' ? 'ENTER THE FLOOR' : 'BACK TO MY COMPANY'} &#8594;</button>
    ${ui.guide === 'help' ? '<div class="founding-links"><button type="button" data-action="intro-replay">Replay Intro</button><button type="button" data-action="rename-startup">Edit startup name</button></div>' : ''}</footer>
  </section></div>`;
  const tip = ui.guide && TIPS[ui.guide];
  if (tip) return `<div class="founding-scrim is-tip"><section class="founding-dialog tip-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title" tabindex="-1" data-tip="${ui.guide}"><p class="founding-kicker" id="guide-title">${tip[0]}</p><p class="tip-copy">${esc(tip[1])}</p><button type="button" data-action="guide-dismiss" data-autofocus>Got it <span aria-hidden="true">&#8594;</span></button></section></div>`;
  const naming = ui.entry === 'found' || ui.guide === 'rename', edit = ui.guide === 'rename', help = ui.guide === 'help';
  const showSteps = help || !edit && ui.showInstructions;
  return `<div class="founding-scrim"><section class="founding-dialog" role="dialog" aria-modal="true" aria-labelledby="founding-title" tabindex="-1">
    <header><p class="founding-kicker">HAIGHT STREET COMPUTE <span>V20</span></p><h1 id="founding-title">${edit ? 'Name your startup' : 'Cluster Tycoon'}</h1>
    ${edit ? '' : '<p class="founding-lead">5 rounds. One AI startup. Get rich.<br>Buy GPUs. Build products. Grow your company.</p>'}</header>
    ${naming ? `<form id="startup-form" novalidate><label for="startup-name">NAME YOUR STARTUP</label><input id="startup-name" name="startup" type="text" maxlength="64" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="go" placeholder="Enter your startup's name" value="${esc(ui.nameDraft || '')}" aria-describedby="name-error" data-autofocus><p id="name-error" class="name-error" aria-live="polite"></p></form>` : ''}
    ${showSteps ? `<section class="founding-how"><h2>How to Play</h2>${steps()}<p class="founding-goal"><b>THE GOAL:</b> Finish with the most valuable founder stake.</p></section>` : ''}
    <footer>${naming ? `<button type="submit" form="startup-form" class="founding-primary" ${nameError(ui.nameDraft) ? 'disabled' : ''}>${edit ? 'SAVE NAME' : 'START'} <span aria-hidden="true">&#8594;</span></button>` : '<button type="button" class="founding-primary" data-action="guide-close" data-autofocus>BACK TO MY COMPANY &#8594;</button>'}
    <div class="founding-links">${!edit && !help && !showSteps ? '<button type="button" data-action="guide-instructions">How to Play</button>' : ''}${!edit ? '<button type="button" data-action="intro-replay">Replay Intro</button>' : ''}${help ? '<button type="button" data-action="rename-startup">Edit startup name</button>' : ''}${g && !help ? '<button type="button" data-action="guide-close">Cancel</button>' : ''}</div></footer>
  </section></div>`;
}
