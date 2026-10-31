// Five complete core rounds; each subsequent round must be earned and chosen.
export const CORE_ROUNDS = 5;
export const EXTENDED_ROUNDS = 10;
export const MAX_ROUNDS = 10;
export const campaignLimit = g => g?.arcade?.extension?.version===2 ? g.arcade.extension.limit : g?.arcade?.extension?.choice==='extend' ? 7 : 5;
export const createExtension = () => ({version:2,limit:5,decisions:[],pending:null,legacyThrough:null});
const units = b => Object.values(b?.recipe || {}).reduce((s,n)=>s+(Number.isSafeInteger(n)?n:0),0);
const delivered = g => g?.arcade?.practice ? [] : (Array.isArray(g?.company?.builds)?g.company.builds:[]).filter(b=>b?.online===1 && b.result!=='setback');
const deliveredAt = b => b.onlineQ || b.q;
const identity = b => b.extensionLane ? `scale:${b.extensionLane}:${b.extensionStage}` : b.business ? `business:${b.business}:${b.stage}` : b.campus ? `campus:${b.stage}` : b.catalog || b.name;
const ordinary = b => !b.scenario && !b.strategic && b.moonshot===undefined && !b.contract && ['product','research','infra'].includes(b.lane);
const paidSubstantial = b => ordinary(b) && units(b)>=8 && (b.cost>0 || b.cashCost>0);
export function qualification(g) {
  const builds=delivered(g),e=g?.arcade?.extension;
  const boundary=e?.version===2 ? (Array.isArray(e.decisions)?e.decisions:[]).filter(d=>d?.choice==='extend').at(-1)?.q || 0 : e?.choice==='extend'?5:0;
  let paths;
  if(!boundary) {
    const business=builds.filter(b=>b.business && Number.isSafeInteger(b.stage)).reduce((m,b)=>Math.max(m,b.stage+1),0);
    const research=builds.filter(b=>b.reward?.level).reduce((m,b)=>Math.max(m,b.reward.level),0);
    const infra=builds.filter(b=>b.campus && Number.isSafeInteger(b.stage)).reduce((m,b)=>Math.max(m,b.stage+1),0);
    paths=[{id:'business',label:'Deliver a third-stage business',current:business,target:3},
      {id:'research',label:'Train a Competitive model',current:Math.min(research,g?.company?.level || 0),target:3},
      {id:'infrastructure',label:'Build a Regional inference campus',current:infra,target:2}];
  } else {
    const previous=builds.filter(b=>deliveredAt(b)<=boundary),fresh=builds.filter(b=>deliveredAt(b)>boundary),seen=new Set(previous.map(identity));
    const major=b=>ordinary(b) && !seen.has(identity(b)) && ((b.business && b.stage>=2) || (b.campus && b.stage>=1) || b.reward?.level>=3 || units(b)>=16);
    paths=[['business','product','Deliver a new major business project'],['research','research','Advance your model or deliver new substantial research'],['infrastructure','infra','Deliver a new major infrastructure project']].map(([id,lane,label])=>({id,label,current:new Set(fresh.filter(b=>b.lane===lane && major(b)).map(identity)).size,target:1}));
    const prior=previous.filter(paidSubstantial).reduce((n,b)=>n+units(b),0),growth=fresh.filter(paidSubstantial).reduce((n,b)=>n+units(b),0);
    paths.push({id:'capacity',label:`Deploy ${Math.max(24,Math.ceil(prior*.15))} more GPUs in substantial paid builds`,current:growth,target:Math.max(24,Math.ceil(prior*.15))});
  }
  paths=paths.map(p=>({...p,complete:p.current>=p.target}));
  const finishRound=campaignLimit(g),qualified=!g?.arcade?.practice && !g?.company?.shutdown && finishRound<MAX_ROUNDS && paths.some(p=>p.complete);
  return {qualified,paths,boundary,finishRound,nextRound:finishRound<MAX_ROUNDS?finishRound+1:null,maxRounds:MAX_ROUNDS,
    summary:finishRound>=MAX_ROUNDS?'Ten rounds complete.':qualified?'One more round earned. Finish or keep going.':boundary?'Grow your company again to earn another round.':'Earn another round through any one company achievement.'};
}
export const extensionProgress = qualification;
function validLegacyExtension(g) {
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


export function validExtension(g) {
  if(!g || typeof g!=='object' || !g.arcade)return false;
  const e=g.arcade.extension;
  if(e?.version!==2)return validLegacyExtension(g);
  const h=g.arcade.history,int=Number.isSafeInteger;
  if(!int(e.limit) || e.limit<5 || e.limit>MAX_ROUNDS || !Array.isArray(e.decisions) || !Array.isArray(h) ||
    h.length>MAX_ROUNDS || h.some((row,i)=>row?.q!==i+1) || ![null,7].includes(e.legacyThrough))return false;
  let horizon=5;
  for(const [i,d] of e.decisions.entries()) {
    if(!d || !int(d.q) || d.q!==horizon || d.q<5 || d.q>=MAX_ROUNDS || !['finish','extend'].includes(d.choice) || h.length<d.q)return false;
    if(d.choice==='finish') {if(i!==e.decisions.length-1 || g.phase!=='over' || g.q!==d.q)return false;}
    else {const to=d.legacy===true?7:d.q+1;if(d.legacy===true && !(i===0 && d.q===5 && e.legacyThrough===7))return false;horizon=to;}
  }
  if(e.legacyClosed===true) {
    if(g.phase!=='over' || g.q>7 || e.pending!==null || ![5,7].includes(e.limit) || e.limit<g.q || e.decisions.length || e.legacyThrough!==null)return false;
  } else if(e.limit!==horizon)return false;
  if(e.lastCheck!==undefined) {
    const t=e.lastCheck;
    if(!t || !int(t.q) || t.q<5 || t.q>10 || t.q>h.length || !['qualified','progress','cap'].includes(t.reason) ||
      typeof t.qualified!=='boolean' || t.qualified!==(t.reason==='qualified') || (t.reason==='cap')!==(t.q===10) ||
      !Array.isArray(t.paths) || ![3,4].includes(t.paths.length) || t.paths.some((p,i)=>!p || p.id!==['business','research','infrastructure','capacity'][i] ||
        typeof p.label!=='string' || !int(p.current) || p.current<0 || !int(p.target) || p.target<1 || p.complete!==(p.current>=p.target)))return false;
  }
  if(!int(g.q) || g.q<1 || g.q>e.limit)return false;
  if(g.phase==='extension') {
    if(g.q<5 || g.q>=MAX_ROUNDS || g.q!==e.limit || h.length!==g.q || e.pending?.q!==g.q || e.pending?.eligible!==true || !qualification(g).qualified ||
      JSON.stringify(e.pending.paths)!==JSON.stringify(qualification(g).paths))return false;
  } else if(e.pending!==null)return false;
  if(['floor','report','integration'].includes(g.phase) && h.length!==g.q-1)return false;
  if(g.phase==='over' && ![g.q-1,g.q].includes(h.length))return false;
  return true;
}
// Migrate facts, never money. An accepted Pass12 two-round promise is honored.
export function normalizeExtension(g) {
  if(!g?.arcade)return false;
  // Retire only the two exact former continuation notices, including the live
  // region. A score was never cash; the new UI must not announce a banked payout.
  const formerNotices=['Five-round result banked. Finish here or continue for two more rounds.',
    'Your five-round result is banked. Prepare for two final scaling rounds.'];
  let noticeChanged=false;
  if(formerNotices.includes(g.arcade.message?.text) && g.phase!=='over') {
    g.arcade.message={text:g.phase==='extension'
      ? `Round ${g.q} complete. Finish with your company’s total bag or play one more round.`
      : 'Your previously accepted continuation through round 7 is preserved. Finish with one final total bag.',tone:'good'};
    noticeChanged=true;
  }
  if(g.arcade.extension?.version===2)return noticeChanged;
  const old=g.arcade.extension,a=g.arcade,next=createExtension();
  if(g.phase==='over') {
    next.limit=Math.max(5,g.q,campaignLimit(g));next.legacyClosed=true;
    if(a.finalScore)Object.assign(a.finalScore,{rounds:g.q,settledRounds:a.history.length,campaignRounds:g.q});
  } else if(old?.choice==='extend') {
    next.limit=7;next.legacyThrough=7;next.decisions=[{q:5,choice:'extend',legacy:true}];
  }
  a.extension=next;
  if(g.phase==='extension')next.pending={q:g.q,eligible:true,paths:qualification(g).paths};
  return true;
}
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
// Larger named scopes stay finite and become available as soon as the preceding
// deployment is online. No campaign-round gate hides them from the core game.
PROJECTS.product.push(
 {name:'Multiregion enterprise platform',recipe:{H100:16,H200:24,B200:24},cashCost:85000000,reward:{revenue:110000000},blurb:'Deploy your enterprise service across regions. New customers pay at this bell.'},
 {name:'Autonomous industry network',recipe:{H100:24,H200:24,B200:32},cashCost:110000000,reward:{revenue:140000000},blurb:'Run an industry-wide service on your deployed platform. Revenue starts this bell.'},
 {name:'Global service backbone',recipe:{H100:24,H200:32,B200:40},cashCost:150000000,reward:{revenue:180000000},blurb:'Commit a major fleet to your worldwide service. Revenue starts this bell.'},
 {name:'Planet-scale enterprise service',recipe:{H100:32,H200:32,B200:32},cashCost:200000000,reward:{revenue:220000000},blurb:'Complete your largest service deployment. Revenue starts this bell.'});
PROJECTS.research.push(
 {name:'Independent model evaluation institute',recipe:{H100:16,H200:24,B200:24},cashCost:65000000,reward:{ip:2000000000,revenue:70000000},blurb:'Validate the next scope of your model and license the results. IP now; license income this bell.'},
 {name:'Scientific model licensing alliance',recipe:{H100:16,H200:24,B200:40},cashCost:85000000,reward:{ip:2400000000,revenue:85000000},blurb:'Deploy your validated research into scientific licensing. IP now; income this bell.'},
 {name:'Open evaluation compute network',recipe:{H100:24,H200:32,B200:40},cashCost:110000000,reward:{ip:2800000000,revenue:100000000},blurb:'Build a broad evaluation service for your research. IP now; income this bell.'},
 {name:'Worldwide model research network',recipe:{H100:32,H200:32,B200:32},cashCost:150000000,reward:{ip:3200000000,revenue:120000000},blurb:'Deliver your largest research licensing scope. IP now; income this bell.'});
PROJECTS.infra.push(
 {name:'Interregional inference grid',recipe:{H100:16,H200:24,B200:24},cashCost:70000000,reward:{rack:{gpu:'H200',qty:40,fleet:true},lease:100000000},blurb:'Lease capacity across regions. Income this bell; 40 H200s at each later open.'},
 {name:'Dedicated frontier compute grid',recipe:{H100:16,H200:24,B200:40},cashCost:100000000,reward:{rack:{gpu:'B200',qty:48,fleet:true},lease:120000000},blurb:'Serve frontier customers. Income this bell; 48 B200s at each later open.'},
 {name:'Global research capacity network',recipe:{H100:24,H200:32,B200:40},cashCost:130000000,reward:{rack:{gpu:'B200',qty:64,fleet:true},lease:150000000},blurb:'Commit a global leased fleet. Income this bell; 64 B200s at each later open.'},
 {name:'Worldwide compute backbone',recipe:{H100:32,H200:32,B200:32},cashCost:170000000,reward:{rack:{gpu:'B200',qty:80,fleet:true},lease:180000000},blurb:'Complete your largest capacity network. Income this bell; owned assets retain exit value.'});

export function extensionCard(g,lane) {
  if(g.arcade?.practice || !PROJECTS[lane])return null;
  const c=g.company,builds=delivered(g);
  const ready=lane==='product'?builds.some(b=>b.business && b.stage>=2):lane==='research'?c.level>=3 && builds.some(b=>b.reward?.level>=3):builds.some(b=>b.campus && b.stage>=1);
  if(!ready)return null;
  const done=c.builds.filter(b=>b.extensionLane===lane),stage=done.length;
  if(stage>=PROJECTS[lane].length || done.some(b=>b.online!==1))return null;
  // Scaling must not force all licensing/site work ahead of the ordinary model
  // or business/campus chain. Interleave by real company readiness, never round.
  if(lane==='research' && stage>=(c.level>=7 || c.agi?6:Math.max(0,c.level-2)))return null;
  if(lane==='product' && stage>0 && !builds.some(b=>b.business && b.stage>=3))return null;
  if(lane==='infra' && stage>0 && !builds.some(b=>b.campus && b.stage>=Math.min(3,stage+1)))return null;
  const spec=PROJECTS[lane][stage];c.cardSeq++;
  return {id:`q${g.q}-${lane}-${c.cardSeq}`,lane,tier:5,catalog:spec.name,...structuredClone(spec),
    extensionLane:lane,extensionStage:stage,mixed:true,cluster:true,flagship:true,
    commercial:{cost:.30,growth:.02,risk:0},q:g.q,status:'open'};
}
