// Presentation only: practice assets, equity and progress belong to the persisted
// training state. No rendering path can buy, grant resources, or unlock a game.
import { esc } from '../util.js';
import { cash, cents, V7 } from '../tycoon/arcade.js';
import { companyStats, expansionCapital } from '../tycoon/founder.js';
import { money, pctOf, bpsText } from './pit-ledger.js';
import { gchip } from './pit-company.js';
import { baburSays, selectBaburExpression } from './babur.js';
const button = (action,text,attrs='') => `<button type="button" data-action="${action}" ${attrs}>${text}</button>`;
const learnedEquity = step => ['funding','large','snake','ready'].includes(step);

export function trainingGuidance(session) {
  const g=session.practice, step=session.step, receipt=g.arcade.confirm?.receipt;
  if(g.arcade.signing) return g.arcade.signing.qty>=48 ? 'Review the cluster purchase and sign the contract.' : g.arcade.signing.gpu==='H200' && session.lastCharm?.tier==='hit' ? 'Good stop. Happy with the quote? Sign the contract below.' : 'Check the GPU and price, then sign your contract.';
  if(receipt?.kind==='term') return 'Cash went up. Your ownership went down. Now let’s put that capital to work.';
  if(receipt?.kind==='purchase' && session.step==='network') return 'GPU nodes secured. Build the network to connect them.';
  if(receipt?.kind==='purchase') return receipt.qty>=48 ? 'Block secured. Build the cluster using this hardware and the quoted capital.' : receipt.gpu==='H100' ? 'H100 secured. Your inventory and cash have updated. Let’s find an H200.' : 'H200 secured. Your inventory and cash have updated.';
  if(g.arcade.active) {
    const lot=g.arcade.lots.find(l=>l.id===g.arcade.active), n=lot?.negotiation;
    if(lot?.qty>=48) return 'Review the large block, then sign its GPU contract.';
    if(step==='network') return 'Review and sign the GPU purchase for your new network.';
    if(n?.running) return 'Stop the marker in the bright zone. Practice retries are free.';
    if(session.lastCharm?.gpu===lot?.gpu && session.lastCharm.tier!=='hit') return 'Missed it. Retry freely, or review and sign the restored quote.';
    if(n?.attempts?.length) return 'Review the Charm result and open the contract.';
    return step==='h100' ? 'Review the H100 purchase, then sign the contract.' : 'Use the Charm bar to get a better price.';
  }
  if(g.phase==='integration') {
    const board=g.arcade.tetris || g.arcade.cable || g.arcade.kernel;
    if(board?.done) return board.result?.perfect ? step==='snake' ? 'Workload complete. Your cluster is running.' : 'That worked. Your next action is ready below.' : 'No penalty. Try that short task again.';
    return step==='node' ? session.legacySequence ? 'Place your reserved GPUs to plan the practice rack.' : 'Your first model is built. Integrate its nodes to bring it online.' : step==='snake' ? 'Block secured. Run the workload using Cluster Snake.' : 'Connect the GPU nodes to the switch, then press TEST NETWORK.';
  }
  return ({meet:'Let’s secure your first GPU: one H100. Select the H100 to make your first purchase.',h100:'Select the H100 to make your first purchase.',h200:'Select H200 to make your second deal. Use the Charm bar to get a better price.',model:'Your GPUs are ready. Build your first model.',node:session.legacySequence ? 'Place your reserved GPUs to plan the practice rack.' : 'Your first model is built. Integrate its nodes to bring it online.',network:'Get two H100 GPUs and build a network to connect them.',cable:'Connect the GPU nodes to the switch, then press TEST NETWORK.',funding:'You need big money to make big moves. Take the investment and see what’s possible.',large:'Your new capital can buy a much bigger GPU block.',snake:'Block secured. Run the workload using Cluster Snake.',ready:'You’re quite the Cluster Tycoon. Step on the trading floor at Haight Street Compute and go get that bag.'})[step] || '';
}
export function trainingView() {return null;}

export function trainingStage(session,ui={}) {
 const g=session.practice, step=session.step, first=step==='meet', ready=step==='ready', s=companyStats(g);
 if (ready) {
  const campaign=ui.trainingCampaign, existing=session.replay && campaign, state=existing ? companyStats(campaign) : null;
  const units=existing ? campaign.arcade.inventory.reduce((n,x)=>n+x.left,0) : 0;
  return `<section class="pit-stage training-stage is-ready training-handoff" aria-label="Training complete"><div class="training-handoff-content">${baburSays(trainingGuidance(session),{expression:'celebrating'})}<h1>${esc(existing ? campaign.company.name : session.name)}</h1><dl><div><dt>Cash</dt><dd>${existing ? money(cash(campaign)) : money(V7.cash)}</dd></div><div><dt>Ownership</dt><dd>${existing ? pctOf(state.founderPct) : '100%'}</dd></div><div><dt>GPUs</dt><dd>${units}</dd></div></dl>${button('training-complete',existing?'Return to company':'Enter the trading floor','class="training-primary" data-autofocus')}${button('training-skip','Skip training','class="training-skip"')}</div></section>`;
 }
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
 else if(step==='model') task=`<h1>Build your first model</h1><p>Use your H100 and H200 to build the model.</p>${button('training-model-build','Build model →','class="training-primary" data-autofocus')}`;
 else if(step==='node') task=session.legacySequence ? `<h1>Plan your practice rack</h1><p>Place your reserved GPUs.</p>${button('training-node','Place the GPUs →','class="training-primary" data-autofocus')}` : `<h1>Integrate your nodes</h1><p class="training-success">✓ First model built</p><p>Fit your H100 and H200 into Node Tetris.</p>${button('training-node','Integrate your nodes →','class="training-primary" data-autofocus')}`;
 else if(step==='network') { const lot=g.arcade.lots.find(l=>l.id==='practice-network-h100'), total=lot ? cents(lot.qty,lot.negotiation?.price??lot.ask) : 0;
  task=session.networkPurchased ? `<h1>Build your network</h1><p class="training-success">✓ 2 H100 secured</p><p>Build the network for $5,000, then connect its nodes.</p>${button('training-network-build','Build network · $5,000 →','class="training-primary" data-autofocus')}` : `<h1>Build a network</h1><p>Your model is online. Add two H100 GPU nodes and connect them to a switch.</p><div class="training-network" role="img" aria-label="Two H100 GPU nodes, disconnected from a central switch"><span>H100 node</span><i>···</i><b>Switch</b><i>···</i><span>H100 node</span></div><p>2 H100 · ${money(total)} total</p>${button('training-network-source','Review GPU purchase →','class="training-primary" data-autofocus')}`;
 }
 else if(step==='cable') task=session.legacySequence && !session.buildId ? `<h1>Build the practice rack</h1><p>Buy the infrastructure for $5,000, then connect it.</p>${button('training-build','Buy infrastructure · $5,000 →','class="training-primary" data-autofocus')}` : `<h1>You bought it. Now connect it.</h1><p>Connect the GPU nodes to the switch, then press TEST NETWORK.</p>`;
 else if(step==='funding') {
  const amount=fund?.amount ?? 200000000, stake=fund?.pct ?? 3333;
  task=`<h1>A fund wants in</h1><p class="training-fund-name">${esc(fund?.name||'Aster Sovereign AI Fund')}</p><div class="training-funding-offer"><div><span>Investment</span><strong>${money(amount)}</strong></div><span class="training-for">for</span><div><span>New investor ownership</span><strong>${bpsText(stake)}</strong></div></div><p class="training-equity-exchange">You own <b>${pctOf(s.founderPct)}</b><span aria-hidden="true"> → </span><b>${pctOf(s.founderPct*(1-stake/10000))}</b></p>${button('training-fund','Accept & sign practice investment →','class="training-primary" data-autofocus')}<p class="training-fine">Fictional fund · practice offer. Funding is a choice in the main game.</p>`;
 }
 else if(step==='large') task=session.largePurchased
  ? `<h1>Turn the block into a cluster</h1><p class="training-success">✓ 48 H100 secured</p><div class="training-large-summary"><span>48 H100</span><span>Build capital <b>${money(bigCapital)}</b></span></div>${button('training-large-build',`Build the 48-GPU cluster →`,'class="training-primary" data-autofocus')}`
  : `<h1>Make one bigger deal</h1><div class="training-cluster" role="img" aria-label="48 H100 GPUs in four racks"><div class="training-racks" aria-hidden="true">${Array.from({length:4},()=>`<div class="training-rack">${Array.from({length:12},()=>'<i></i>').join('')}</div>`).join('')}</div><div><strong>48 H100</strong><span>${money(bigPrice)} total</span></div></div>${button('training-large-source','Review the large GPU contract →','class="training-primary" data-autofocus')}`;
 else if(step==='snake') task=`<h1>You’ve built a cluster</h1><p class="training-success">✓ 50 GPUs deployed · Cluster Snake unlocked</p><p>Keep the workload moving through your hardware.</p>${button('training-snake','Run the workload · Cluster Snake →','class="training-primary" data-autofocus')}<p class="training-fine">This lesson moves one cell per arrow press. The main game moves continuously.</p>`;
 else if(ready && session.replay) task=`<h1>Training complete</h1><p class="training-success">✓ Sourced, signed, connected and scaled</p><p>The practice portfolio returns to Babur. Your current company is waiting exactly as you left it.</p>`;
 else if(ready) task=`<h1>Your screen is ready</h1><p class="training-success">✓ GPU deals · infrastructure · investment · cluster</p><div class="training-reset"><h2>Your real startup</h2><p>The practice cash, hardware and fund shares return to Babur. Your five-round company starts fresh:</p><dl><div><dt>Cash</dt><dd>${money(V7.cash)}</dd></div><div><dt>GPUs & infrastructure</dt><dd>0</dd></div><div><dt>Your ownership</dt><dd>100%</dd></div></dl><p>Minigames start locked. Earn them through real builds in each company, then play between rounds.</p></div>`;
 const showBusiness=!first&&!ready&&(stock.length>0||session.nodeDone||session.buildId);
 const business=showBusiness?`<aside class="training-business ${learnedEquity(step)?'is-settled':''}" aria-label="Your practice GPUs"><h2>Your GPUs</h2><div class="training-stock">${Object.entries(owned).map(([gpu,n])=>`<span class="gpu-${gpu.toLowerCase()}">${gchip(gpu)}<b>${n}</b> ${esc(gpu)}</span>`).join('')}</div>${session.cableDone?`<p class="training-fine">✓ Starter rack connected</p>`:session.nodeDone?(session.legacySequence?'<p class="training-fine">✓ Rack planned</p>':'<p class="training-fine">✓ Model online</p>'):''}${session.largeBuildId?'<p class="training-fine">✓ 48-GPU cluster online</p>':''}</aside>`:'';
 const readyFooter=ready?`<footer class="training-ready-footer">${button('training-complete',session.replay?'Return to company →':'Start round 1 →','class="training-primary" data-autofocus')}</footer>`:'';
 const header=`<header class="training-header ${showCash?'has-cash':''} ${showEquity?'has-equity':''}"><img src="brand/logo/hsc-lockup-ink.svg" width="116" height="41" alt="Haight Street Compute"><b>GPU training</b>${showCash?`<div class="hud-cash"><span>Practice cash</span><strong data-fx-cash>${money(cash(g))}</strong></div>`:''}${showEquity?`<div class="hud-val"><span>Your ownership</span><strong>${pctOf(s.founderPct)}</strong></div>`:''}${button('help','Help','class="training-help"')}</header>`;
 return `<section class="pit-stage training-stage ${showCash?'has-training-cash':''} ${ready?'is-ready':''}" aria-label="GPU training with Babur">${header}<div class="pit-main training-main ${ui.focusOpen?'is-training-backdrop':''}">${business}<section class="training-workspace">${baburSays(trainingGuidance(session),{small:!first,expression:selectBaburExpression(session)})}<article class="training-task">${task}</article>${!ui.focusOpen&&!ready?button('training-skip','Skip training','class="training-skip"'):''}</section></div>${readyFooter}</section>`;
}
