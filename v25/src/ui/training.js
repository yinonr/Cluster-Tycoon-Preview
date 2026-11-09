// Presentation only: practice assets, equity and progress belong to the persisted
// training state. No rendering path can buy, grant resources, or unlock a game.
// V22.1: the lesson is the real game screen. The real HUD (cash, GPU stock) sits on top, lesson lots are
// real broker booths, the fund is a real investor booth, projects live in the real Projects panel.
// Babur owns the business lines; Evan, the technical co-founder, owns hardware, networks and the games.
import { esc } from '../util.js';
import { cash, V7 } from '../tycoon/arcade.js';
import { companyStats } from '../tycoon/founder.js';
import { money, pctOf } from './pit-ledger.js';
import { projectsPanel } from './pit-company.js';
import { hud, booth, desk, investorBooth, floorCols } from './pit-stage.js';
import { baburSays, baburPortrait, selectBaburExpression } from './babur.js';
import { evanSays } from './evan.js';
import { TRAINING_LOTS, TRAINING_H200_ALT } from '../tycoon/training.js';
const button = (action,text,attrs='') => `<button type="button" data-action="${action}" ${attrs}>${text}</button>`;

// Who speaks, and the line. The approved Evan lines are used verbatim.
export const EVAN_LINES = Object.freeze({
  doubleDown: 'Want a better deal? Try your luck with Double Down. Miss, and the supplier will hold it against you—and charge you more.',
  overRizz: 'Want an even BETTER deal? Try your luck with Over-Rizz.',
  model: 'Those are some nice GPUs you got there. Click on the Projects tab to build your model.',
  network: 'Let’s find some more GPUs and get them talking. To InfiniBand and beyond!',
  snake: 'Captain Rack SpareRow, coming in hot! Let’s run the workload using Cluster Snake.',
  large: '48 H100s. Find them.',
  moMoney: 'Mo money, mo clusters. Go buy a big GPU block and put it to work.',
});
// V24: a line may carry a phone wording for the same instruction (the compact Projects bar replaces the side panel).
export const PHONE_LINES = Object.freeze({ [EVAN_LINES.model]: 'Those are some nice GPUs you got there. Tap the Projects tab to build your model.' });
export function trainingLine(session) {
  const g=session.practice, a=g.arcade, step=session.step, receipt=a.confirm?.receipt, B=text=>({who:'babur',text}), E=text=>({who:'evan',text});
  if(a.signing?.kind==='term') return B('');
  if(a.signing) return a.signing.qty>=48 ? E('Sign for the block. Then we rack it.') : B('');
  if(receipt?.kind==='term') return E(EVAN_LINES.moMoney);
  if(receipt?.kind==='purchase') return step==='network' ? E('Nodes in hand. Now wire them up.') : receipt.qty>=48 ? E('Block secured. Build the cluster.') : receipt.gpu==='H100' ? B('One H100, secured. Now let’s get an H200.') : B('Let’s build a model now.');
  if(a.active) {
    const lot=a.lots.find(l=>l.id===a.active), n=lot?.negotiation;
    if(lot?.qty>=48) return E('Big block. Sign for it.');
    if(step==='network') return E('Two H100 nodes. Sign for them.');
    if(n?.running) return B('');
    if(lot?.status==='walked') return B('They walked. Lucky for you, I know another seller.');
    if(session.lastCharm?.gpu===lot?.gpu && session.lastCharm.tier!=='hit' && n?.attempts?.length<=1) return B('Missed. The first try is on me. Go again.');
    if(n?.attempts?.length) return B('That’s your quote now. If you overdo Charm, sellers will remember.');
    // V24.7: Babur stands in the first H100's window with the opening of his floor line (no new copy).
    return step==='h100' ? B('Let’s get your first GPU.') : B('Hit the bright zone to charm the seller.');
  }
  if(g.phase==='integration') {
    const board=a.tetris || a.cable || a.kernel;
    if(board?.done) return board.result?.perfect ? E(step==='snake' ? 'Workload done. That cluster is earning.' : 'Clean. On to the next one.') : E('Close. Run it again.');
    return step==='node' ? E('Fit the nodes into the rack. Full rows come online.') : step==='snake' ? E(EVAN_LINES.snake) : E('Connect every node to the switch, then attempt integration.');
  }
  if(step==='network' && session.networkPurchased) return E('Nodes in stock. Build the network in Projects.');
  if(step==='large' && session.largePurchased) return E('Block in stock. Build the cluster in Projects.');
  return ({meet:B('Let’s get your first GPU. Tap the H100 broker.'),h100:B('Tap the H100 broker.'),
    h200:B('H200 spotted. See if you can charm your way to a deal.'),model:E(EVAN_LINES.model),node:E('Fit the nodes into the rack. Full rows come online.'),
    network:E(EVAN_LINES.network),cable:E('Connect every node to the switch, then attempt integration.'),
    funding:B(a.signing?.kind==='term'||a.confirm?.termId ? 'Charm them. Watch the equity.' : 'Charm your way to a better term sheet.'),large:E(EVAN_LINES.large),snake:E(EVAN_LINES.snake),
    ready:B('You’re quite the Cluster Tycoon. Let’s trade some GPUs.')})[step] || B('');
}
export const trainingGuidance = session => trainingLine(session).text;
export function speak(session, { small = false, context = 'stage' } = {}) {
  const l=trainingLine(session);
  if(!l.text) return '';
  // Evan's pose follows the line: tempting (Double Down) explains, scale and the snake celebrate.
  const pose=l.text===EVAN_LINES.doubleDown?'explaining':[EVAN_LINES.large,EVAN_LINES.snake,EVAN_LINES.moMoney].includes(l.text)||/done|Clean/.test(l.text)?'celebrating':'neutral';
  const phone=PHONE_LINES[l.text];
  return l.who==='evan' ? evanSays(l.text,{small,expression:pose,phone}) : baburSays(l.text,{small,expression:selectBaburExpression(session,{context}),phone});
}
export function trainingView() {return null;}

// The lesson's live lots, as booths: one GPU at a time, then the network nodes, then the big block.
function lessonLots(session) {
  const a=session.practice.arcade, step=session.step;
  const ids=step==='meet'||step==='h100' ? [TRAINING_LOTS.H100] : step==='h200' ? [TRAINING_LOTS.H200,TRAINING_H200_ALT] : step==='network'&&!session.networkPurchased ? ['practice-network-h100'] : step==='large'&&!session.largePurchased ? ['practice-block','practice-lot-2','practice-lot-10'] : [];
  return a.lots.filter(l=>ids.includes(l.id) && l.status==='open');
}
// Other brokers on the lesson floor are away from their desks: the room looks like the real one without extra offers.
const FILLER_FIRMS=['Granite State GPU','Juniper Grid','Meridian Racks','Basalt Compute','Lodestar Neocloud'];
const LESSON_CARD={model:'practice-model',network:'practice-infra',large:'practice-cluster'};

export function trainingStage(session,ui={}) {
  const g=session.practice, step=session.step, ready=step==='ready';
  if (ready) return readyStage(session,ui);
  if (ui.founderIntro && step==='meet') return founderIntroStage(session,ui.founderIntro);
  const live=!ui.focusOpen, lots=lessonLots(session), need=new Set(lots.map(l=>l.gpu));
  // The model lesson is a small trading floor: three fixed H100 lots on desks, brought forward by Find.
  // V22.4: every lesson with brokers is the real floor: desks (face, offer screen, lot chips, total), not tutorial-only booths.
  const floorLesson=lots.length>0, front=step==='large'&&ui.floorGpu&&ui.findIds?ui.findIds:[];
  const seatsOf=lots.map((lot,i)=>({seat:i,lot,previous:lot,id:lot.id,status:'live'})).concat(Array.from({length:Math.max(0,6-lots.length)},(_,i)=>({seat:lots.length+i,lot:null,previous:{firm:FILLER_FIRMS[i%FILLER_FIRMS.length]},id:null,status:'cooldown'})));
  const lessonTarget=step==='large'?(ui.floorGpu||null):(lots[0]?.gpu||null);
  const booths=floorLesson ? seatsOf.map(sl=>desk(g,sl,{live,need,target:lessonTarget,pulse:!!ui.floorPulse,orderOf:x=>{const k=front.indexOf(x.lot?.id);return k<0?0:k-1000;}})).join('') : '';
  ui.floorPulse=false;
  const fund=step==='funding'&&!session.funded ? g.arcade.terms.filter(t=>t.status==='open').map(t=>investorBooth(g,t,live).replace('data-action="review-term"','data-action="training-fund"')).join('') : '';
  const lesson=LESSON_CARD[step], showProjects=['model','node','network','cable','funding','large','snake'].includes(step);
  // V24: the model lesson opens with Projects closed, so Evan's “Click on the Projects tab” is literally the next move.
  const closed=step==='model' && g.phase==='floor' && !ui.lessonProjectsOpen;
  const projects=showProjects ? projectsPanel(g,{lessonCard:lesson,projectOrder:[],onlyCards:Object.values(LESSON_CARD),projectsCollapsed:closed},live).replace('class="proj-tab"',closed?'class="proj-tab is-lesson-target"':'class="proj-tab"') : '';
  const cols=Math.max(1,floorCols(Math.max(1,lots.length)));
  // Puzzles reopen from the floor if the player closed them (or reloaded mid-lesson).
  const resume=step==='node'&&g.phase==='floor' ? button('training-node','Integrate the nodes →','class="training-primary"') : step==='snake'&&g.phase==='floor' ? button('training-snake','Run the workload →','class="training-primary"') : '';
  const stage=`<div class="pit-hall v221-lesson-hall" style="--cols:${Math.min(cols,lots.length||1)};--rows:1">${fund?`<div class="v22-investors" aria-label="Investor">${fund}</div>`:''}${booths?`<div class="pit-stations v22-booths v221-lesson-booths ${floorLesson?'v222-floor is-lesson-floor':''}" aria-label="Brokers">${booths}</div>`:''}${resume?`<div class="v221-lesson-go">${resume}</div>`:''}</div>`;
  return `<section class="pit-stage v22-floor training-stage v22-training v221-training step-${esc(step)}" aria-label="GPU training with Babur and Evan">
    ${hud(g,ui,!live)}
    <div class="pit-main v22-main ${showProjects?(closed?'projects-collapsed':''):'projects-collapsed v221-no-projects'}">
      <div class="pit-room">
        <div class="pit-hintbar v221-lesson-line">${speak(session)}${live?button('training-skip','Skip training','class="training-skip"'):''}</div>
        ${stage}
      </div>
      ${showProjects?`<aside class="pit-board projects-board">${projects}</aside>`:''}
    </div>
  </section>`;
}

// The farewell: Babur, the real company you are about to run, one button.
// V23: the founder intro. The V10.18 CEO briefing, spoken by Babur as the lesson's first scene (two beats), then the
// H100 lesson. Presentation only: no save field, no state change; the ready screen is its bookend.
export const FOUNDER_INTRO = Object.freeze([
  name => [`You’re the CEO of ${name}. You built a product, hired a team, and secured funding (your savings).`, 'One thing’s missing. Compute.', `${name} needs you to be a Cluster Tycoon.`],
  () => ['Welcome to Haight Street Compute. 5 rounds on the trading floor. Can your start-up make it big?'],
]);
function founderIntroStage(session,beat) {
  const last=beat>=FOUNDER_INTRO.length;
  return `<section class="pit-stage training-stage is-ready v22-training v221-training v221-ready v23-founder-intro" aria-label="Your company">
    <div class="v221-farewell">${baburSays(FOUNDER_INTRO[beat-1](session.name),{expression:last?'celebrating':'explaining'})}
      <div class="v221-company"><b class="v221-company-name">${esc(session.name)}</b>${button('rename-startup','Edit name','class="v24-edit-name" aria-label="Edit startup name"')}
      ${button('founder-intro-next',last?'Start trading →':'Continue →','class="training-primary" data-autofocus')}${button('training-skip','Skip training','class="training-skip"')}</div>
    </div>${last?'':`<span hidden>${baburPortrait('celebrating')}</span>`}
  </section>`;
}
function readyStage(session,ui) {
  const campaign=ui.trainingCampaign, existing=session.replay && campaign, s=existing ? companyStats(campaign) : null;
  const units=existing ? campaign.arcade.inventory.reduce((n,x)=>n+x.left,0) : 0;
  const facts=[['Cash',existing ? money(cash(campaign)) : money(V7.cash)],['Ownership',existing ? pctOf(s.founderPct) : '100%'],['GPUs',String(units)],['Round',existing ? `${campaign.q}` : '1 of 5']];
  return `<section class="pit-stage training-stage is-ready v22-training v221-training v221-ready" aria-label="Training complete">
    <div class="v221-farewell">${baburSays(trainingGuidance(session),{expression:'celebrating'})}
      <div class="v221-company"><b class="v221-company-name">${esc(existing ? campaign.company.name : session.name)}</b><dl>${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${button('training-complete',existing?'Return to company →':'Enter the trading floor →','class="training-primary" data-autofocus')}</div>
    </div>
  </section>`;
}
