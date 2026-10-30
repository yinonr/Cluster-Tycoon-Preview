// The extension is earned by delivered campaign work, never practice or valuation.
export const CORE_ROUNDS = 5;
export const EXTENDED_ROUNDS = 7;
export const campaignLimit = g => g?.arcade?.extension?.choice === 'extend' ? EXTENDED_ROUNDS : CORE_ROUNDS;
export function qualification(g) {
  const builds = g?.arcade?.practice ? [] : (g?.company?.builds || []).filter(b => b.online === 1 && b.q <= CORE_ROUNDS);
  const business = builds.filter(b => b.business && Number.isSafeInteger(b.stage)).reduce((m,b) => Math.max(m,b.stage+1),0);
  const research = builds.filter(b => b.reward?.level && b.result !== 'setback').reduce((m,b) => Math.max(m,b.reward.level),0);
  const infra = builds.filter(b => b.campus && Number.isSafeInteger(b.stage)).reduce((m,b) => Math.max(m,b.stage+1),0);
  const paths = [
    {id:'business',label:'Deliver a third-stage business',current:business,target:3},
    {id:'research',label:'Train a Competitive model',current:Math.min(research,g?.company?.level || 0),target:3},
    {id:'infrastructure',label:'Build a Regional inference campus',current:infra,target:2},
  ].map(p => ({...p,complete:p.current>=p.target}));
  const qualified = !g?.company?.shutdown && paths.some(p => p.complete);
  return {qualified,paths,summary:qualified?'Two more rounds earned. Decide after round five.':'Earn two more rounds through any one achievement.'};
}
export const extensionProgress = qualification;
export function validExtension(g) {
  if(!g || typeof g!=='object' || !g.arcade)return false;
  const e=g?.arcade?.extension;
  if(e===undefined)return g.q<=CORE_ROUNDS && g.phase!=='extension'; // legacy runs stay closed once complete
  if(!e || e.version!==1 || ![null,'finish','extend'].includes(e.choice))return false;
  const b=e.bankedFive;
  if(!b)return e.choice===null && g.q<=CORE_ROUNDS && g.phase!=='extension';
  const f=b.finalScore,x=b.exit,h=g.arcade.history;
  if(!f || f.rounds!==5 || !Number.isSafeInteger(f.payout) || f.payout<0 || !x ||
    ['payout','founderPct','equity','kind'].some(k=>x[k]!==f[k]) || typeof e.eligible!=='boolean')return false;
  if(!Array.isArray(h) || h.length<5 || h.length>7 || h.some((r,i)=>r?.q!==i+1))return false;
  if(!Array.isArray(e.paths) || e.paths.length!==3 || e.paths.some((p,i)=>p?.id!==['business','research','infrastructure'][i] ||
    p.target!==[3,3,2][i] || !Number.isSafeInteger(p.current) || p.current<0 || p.complete!==(p.current>=p.target)) ||
    e.eligible!==e.paths.some(p=>p.complete))return false;
  if(e.choice===null && !(g.q===5 && h.length===5 && g.phase===(e.eligible?'extension':'over')))return false;
  if(e.choice==='finish' && !(e.eligible && g.phase==='over' && g.q===5 && h.length===5))return false;
  if(e.choice==='extend') {
    if(!e.eligible || g.q<6 || g.q>7 || !['floor','integration','report','over'].includes(g.phase))return false;
    if(g.phase==='over' ? ![g.q-1,g.q].includes(h.length) : h.length!==g.q-1)return false;
  }
  return true;
}

// Finite, company-specific scaling projects. Each stage can be delivered only once.
// R6 assets pay at the R6 bell and remain productive through R7. R7 leases pay
// immediately at its bell; rack capacity also has the ordinary exit valuation.
const PROJECTS = {
  product: [
    {name:'Global service rollout',recipe:{H100:24,H200:16},cashCost:30000000,reward:{revenue:60000000},blurb:'Take your delivered business worldwide. Recurring revenue starts at this bell.'},
    {name:'Enterprise operating platform',recipe:{H200:32,B200:16},cashCost:60000000,reward:{revenue:90000000},blurb:'Serve enterprise customers at scale. New revenue starts at this bell.'},
  ],
  research: [
    {name:'Independent frontier validation',recipe:{H200:16,B200:24},cashCost:25000000,reward:{ip:800000000,revenue:40000000},blurb:'Turn your proven model into validated IP and a licensed service. IP now; license revenue at this bell.'},
    {name:'Global model licensing network',recipe:{H200:24,B200:32},cashCost:45000000,reward:{ip:1500000000,revenue:60000000},blurb:'License the validated model worldwide. New IP now; license revenue at this bell.'},
  ],
  infra: [
    {name:'Dedicated compute utility',recipe:{H200:24,B200:24},cashCost:30000000,reward:{rack:{gpu:'B200',qty:24,fleet:true},lease:40000000},blurb:'A dedicated leased fleet. Lease income at this bell; 24 B200s at the next open.'},
    {name:'Continental capacity network',recipe:{H100:32,H200:32,B200:32},cashCost:50000000,reward:{rack:{gpu:'B200',qty:48,fleet:true},lease:80000000},blurb:'Lease a continental network. Lease income at this bell; owned capacity counts in your final value.'},
  ],
};
export function extensionCard(g,lane) {
  if(g.arcade?.practice || g.arcade?.extension?.choice!=='extend' || g.q<6 || !PROJECTS[lane])return null;
  const c=g.company, paths=qualification(g).paths;
  const path={product:'business',research:'research',infra:'infrastructure'}[lane];
  if(!paths.find(p=>p.id===path)?.complete)return null;
  const done=c.builds.filter(b=>b.extensionLane===lane);
  const stage=done.length;
  if(stage>=2 || stage===1 && (g.q<7 || done[0].online!==1))return null;
  const spec=PROJECTS[lane][stage];c.cardSeq++;
  return {id:`q${g.q}-${lane}-${c.cardSeq}`,lane,tier:5,catalog:spec.name,...structuredClone(spec),
    extensionLane:lane,extensionStage:stage,mixed:true,cluster:true,flagship:true,
    commercial:{cost:.30,growth:.02,risk:0},q:g.q,status:'open'};
}
