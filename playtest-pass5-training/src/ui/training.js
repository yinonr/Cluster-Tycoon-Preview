// Presentation only: practice assets, equity and progress belong to the persisted
// training state. No rendering path can buy, grant resources, or unlock a game.
import { esc } from '../util.js';
import { cash, cents } from '../tycoon/arcade.js';
import { companyStats, expansionCapital } from '../tycoon/founder.js';
import { money, pctOf, bpsText } from './pit-ledger.js';
import { gchip } from './pit-company.js';
import { baburSays, selectBaburExpression } from './babur.js';
const button = (action,text,attrs='') => `<button type="button" data-action="${action}" ${attrs}>${text}</button>`;
const learnedEquity = step => ['funding','large','snake','ready'].includes(step);

export function trainingGuidance(session) {
  const g=session.practice, step=session.step, receipt=g.arcade.confirm?.receipt;
  if(g.arcade.signing) return g.arcade.signing.qty>=48 ? 'One large block. Review the total, then sign to pay from your new capital.' : 'Check the GPU, quantity and total. Sign the contract to pay.';
  if(receipt?.kind==='term') return 'Cash went up. Your ownership went down. Now let’s put that capital to work.';
  if(receipt?.kind==='purchase') return receipt.qty>=48 ? 'Block secured. Build the cluster using this hardware and the quoted capital.' : `${receipt.gpu} secured. Your inventory and cash have updated.`;
  if(g.arcade.active) {
    const lot=g.arcade.lots.find(l=>l.id===g.arcade.active), n=lot?.negotiation;
    if(lot?.qty>=48) return 'Review the large block, then sign its GPU contract.';
    if(n?.running) return 'Stop the marker in the bright zone. Practice retries are free.';
    if(session.lastCharm?.gpu===lot?.gpu && session.lastCharm.tier!=='hit') return 'Missed it. Retry freely, or review and sign the restored quote.';
    if(n?.attempts?.length) return 'Good stop. Review your quote, then sign the GPU contract.';
    return step==='h100' ? 'Try Charm: start the meter, then stop in the bright zone.' : 'One more GPU. Charm is optional: review the quote and sign when ready.';
  }
  if(g.phase==='integration') {
    const board=g.arcade.tetris || g.arcade.cable || g.arcade.kernel;
    if(board?.done) return board.result?.perfect ? step==='snake' ? 'Two jobs done. You’ve seen the big-cluster controls.' : 'That worked. Your next action is ready below.' : 'No penalty. Try that short task again.';
    return step==='node' ? 'Move and rotate each GPU shape, then drop it into the rack.' : step==='snake' ? 'Steer the workload onto both jobs. Each arrow press moves one cell in this lesson.' : 'Join both GPU nodes to the switch, then test the network.';
  }
  return ({meet:'Let’s secure your first GPUs: one H100 and one H200.',h100:'Select H100 to return to its broker.',h200:'H100 secured. Select H200 to make your second deal.',node:'Both GPUs are yours. Give them a place in the rack.',cable:'Rack planned. Buy the infrastructure, then connect it.',funding:'Big money for a big stake. Try this practice investment to build bigger.',large:'Your new capital can buy a much bigger GPU block.',snake:'A 50-GPU deployment earned Cluster Snake. Try a short workload.',ready:'You’ve made the deals and run the hardware. Your company screen is ready.'})[step] || '';
}
export function trainingView() {return null;}

export function trainingStage(session,ui={}) {
 const g=session.practice, step=session.step, first=step==='meet', ready=step==='ready', s=companyStats(g);
 const showCash=!first, showEquity=learnedEquity(step);
 const stock=g.arcade.inventory.filter(l=>l.left>0), owned=stock.reduce((r,l)=>(r[l.gpu]=(r[l.gpu]||0)+l.left,r),{});
 const requirement=gpu=>button(first?'training-begin':'training-source',`<span class="training-gpu gpu-${gpu.toLowerCase()}">${gchip(gpu)}<b>1 ${gpu}</b></span><span>Find GPU →</span>`,`class="training-requirement is-next" data-gpu="${gpu}" aria-label="Find 1 ${gpu}" ${first?'data-autofocus':''}`);
 const fund=g.arcade.terms.find(t=>t.id==='practice-sovereign') || g.arcade.terms[0];
 const cluster=g.arcade.objectives.find(c=>c.id==='practice-cluster');
 const bigLot=g.arcade.lots.find(l=>l.id==='practice-block');
 const bigPrice=bigLot?cents(bigLot.qty,bigLot.negotiation?.price??bigLot.ask):25754400;
 const bigCapital=cluster?.cashCost ?? expansionCapital(g,{H100:48});
 let task='';
 if(first) task=`<h1>Your first GPU deal</h1><div class="training-requirements has-one">${requirement('H100')}</div><p class="training-fine">Practice money. The five main rounds begin afterward.</p>`;
 else if(['h100','h200'].includes(step)) task=`<h1>Secure your ${step==='h100'?'H100':'H200'}</h1><div class="training-requirements has-one">${requirement(step==='h100'?'H100':'H200')}</div>`;
 else if(step==='node') task=`<h1>Give your GPUs a place</h1><p>Your H100 and H200 become two rack shapes. Planning reserves them for this build.</p>${button('training-node','Place the GPUs · Node Tetris →','class="training-primary" data-autofocus')}`;
 else if(step==='cable') task=`<h1>Now connect the hardware</h1><p class="training-success">✓ Rack plan ready</p><p>Build with your reserved GPUs and $5,000 of infrastructure capital. Then connect the rack.</p>${button('training-build','Buy infrastructure · $5,000 →','class="training-primary" data-autofocus')}`;
 else if(step==='funding') {
  const amount=fund?.amount ?? 200000000, stake=fund?.pct ?? 3333;
  task=`<h1>A fund wants in</h1><p class="training-fund-name">${esc(fund?.name||'Aster Sovereign AI Fund')}</p><div class="training-funding-offer"><div><span>Investment</span><strong>${money(amount)}</strong></div><span class="training-for">for</span><div><span>New investor ownership</span><strong>${bpsText(stake)}</strong></div></div><p class="training-equity-exchange">You own <b>${pctOf(s.founderPct)}</b><span aria-hidden="true"> → </span><b>${pctOf(s.founderPct*(1-stake/10000))}</b></p>${button('training-fund','Accept & sign practice investment →','class="training-primary" data-autofocus')}<p class="training-fine">Fictional fund · practice offer. Funding is a choice in the main game.</p>`;
 }
 else if(step==='large') task=session.largePurchased
  ? `<h1>Turn the block into a cluster</h1><p class="training-success">✓ 48 H100 secured</p><div class="training-large-summary"><span>48 H100</span><span>Build capital <b>${money(bigCapital)}</b></span></div>${button('training-large-build',`Build the 48-GPU cluster →`,'class="training-primary" data-autofocus')}`
  : `<h1>Make one bigger deal</h1><div class="training-block-visual gpu-h100">${gchip('H100')}<strong>48 H100</strong><span>${money(bigPrice)} total</span></div>${button('training-large-source','Review the large GPU contract →','class="training-primary" data-autofocus')}`;
 else if(step==='snake') task=`<h1>You’ve built a cluster</h1><p class="training-success">✓ 50 GPUs deployed · Cluster Snake unlocked</p><p>Keep the workload moving through your hardware. Try two jobs on a small practice grid.</p>${button('training-snake','Run the workload · Cluster Snake →','class="training-primary" data-autofocus')}<p class="training-fine">This lesson moves one cell per arrow press. The main game moves continuously.</p>`;
 else if(ready && session.replay) task=`<h1>Training complete</h1><p class="training-success">✓ Sourced, signed, connected and scaled</p><p>The practice portfolio returns to Babur. Your current company is waiting exactly as you left it.</p>`;
 else if(ready) task=`<h1>Your screen is ready</h1><p class="training-success">✓ GPU deals · infrastructure · investment · cluster</p><div class="training-reset"><h2>Your real startup</h2><p>The practice cash, hardware and fund shares return to Babur. Your five-round company starts fresh:</p><dl><div><dt>Cash</dt><dd>$65,000</dd></div><div><dt>GPUs & infrastructure</dt><dd>0</dd></div><div><dt>Your ownership</dt><dd>100%</dd></div></dl><p>Minigame prizes are untouched. Replay learned games from Inventory and Company.</p></div>`;
 const showBusiness=!first&&!ready&&(stock.length>0||session.nodeDone||session.buildId);
 const business=showBusiness?`<aside class="training-business ${learnedEquity(step)?'is-settled':''}" aria-label="Your practice GPUs"><h2>Your GPUs</h2><div class="training-stock">${Object.entries(owned).map(([gpu,n])=>`<span class="gpu-${gpu.toLowerCase()}">${gchip(gpu)}<b>${n}</b> ${esc(gpu)}</span>`).join('')}</div>${session.cableDone?`<p class="training-fine">✓ Starter rack connected</p>`:session.nodeDone?'<p class="training-fine">✓ GPUs reserved · rack planned</p>':''}${session.largeBuildId?'<p class="training-fine">✓ 48-GPU cluster online</p>':''}</aside>`:'';
 const readyFooter=ready?`<footer class="training-ready-footer">${button('training-complete',session.replay?'Return to company →':'Start round 1 →','class="training-primary" data-autofocus')}</footer>`:'';
 const header=`<header class="training-header ${showCash?'has-cash':''} ${showEquity?'has-equity':''}"><img src="brand/logo/hsc-lockup-ink.svg" width="116" height="41" alt="Haight Street Compute"><b>GPU training</b>${showCash?`<div class="hud-cash"><span>Practice cash</span><strong data-fx-cash>${money(cash(g))}</strong></div>`:''}${showEquity?`<div class="hud-val"><span>Your ownership</span><strong>${pctOf(s.founderPct)}</strong></div>`:''}${button('help','Help','class="training-help"')}</header>`;
 return `<section class="pit-stage training-stage ${showCash?'has-training-cash':''} ${ready?'is-ready':''}" aria-label="GPU training with Babur">${header}<div class="pit-main training-main ${ui.focusOpen?'is-training-backdrop':''}">${business}<section class="training-workspace">${baburSays(trainingGuidance(session),{small:!first,expression:selectBaburExpression(session)})}<article class="training-task">${task}</article>${ui.trainingCanSkip&&!ready?button('training-skip',session.replay?'Return to company':'Skip to round 1','class="training-skip"'):''}</section></div>${readyFooter}</section>`;
}
