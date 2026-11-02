// Fortune Builder: explicit, finite staged businesses. All amounts are integer cents.
// A stage adds new customers/capacity; the old tranche keeps earning. No replacement double count.
import { ECONOMY } from './economy-balance.js';
import { stream } from '../util.js';
import { enterpriseValue } from './founder.js';
export const BUSINESSES = Object.freeze([
 // id, names, GPU mix, revenue profile, cost ratio, growth, research gate, risk
 ['consumer', ['Personal AI assistant','Distribution partnership','Consumer agent network','Global personal AI'], {H100:3,H200:1}, [6500000,75000000,420000000,1600000000], .34,.14,0,.08],
 ['coding', ['Coding agent','Enterprise coding platform','Developer ecosystem','Global developer cloud'], {H100:2,H200:2}, [6000000,65000000,380000000,1450000000], .19,.11,0,.03],
 ['security', ['Threat-response pilot','Cybersecurity contracts','Autonomous security platform','Global security network'], {H200:3}, [5500000,60000000,320000000,1100000000], .16,.06,0,0],
 ['synthetic', ['Synthetic data service','Frontier lab data contract','RL services platform','Frontier data market'], {H200:2,B200:1}, [5500000,70000000,400000000,1500000000], .24,.10,1,.04],
 ['biotech', ['Drug discovery study','Pharma partnership','Scientific discovery platform','Global discovery alliance'], {H200:2,B200:2}, [3500000,85000000,480000000,1900000000], .30,.08,1,.10],
 ['ads', ['Ad targeting engine','Commerce distribution','AI advertising market','Global audience platform'], {H100:4,H200:1}, [7000000,85000000,440000000,1700000000], .38,.15,0,.09],
 ['enterprise', ['Workflow agents','Enterprise agent workforce','Agent operating system','Autonomous enterprise network'], {H200:2,B200:1}, [6500000,75000000,450000000,1800000000], .25,.10,1,.04],
 ['finance', ['Quant research service','Financial analytics network','Institutional AI platform','Global financial intelligence'], {H100:2,B200:2}, [5000000,75000000,420000000,1700000000], .26,.08,1,.10],
 ['gaming', ['Game-world agents','Gaming analytics network','Interactive world platform','Global gaming intelligence'], {H100:3,H200:2}, [6000000,70000000,390000000,1550000000], .31,.13,0,.08],
 ['creative', ['Voice and video studio','Multimodal creative suite','Creator marketplace','Global creative network'], {H200:3,B200:1}, [6500000,80000000,440000000,1750000000], .32,.12,1,.06],
 ['vertical', ['Vertical software pilot','Industry software suite','Vertical AI ecosystem','Global industry platform'], {H100:2,H200:1}, [5000000,55000000,300000000,1200000000], .15,.07,0,.02],
 ['inference', ['Inference service','Inference capacity network','Agent marketplace','Global inference utility'], {H100:2,H200:3}, [6000000,65000000,380000000,1500000000], .35,.09,0,.03],
]);
export const businessSpec = id => BUSINESSES.find(x=>x[0]===id);
const stepScale=ECONOMY.business.size, capex=ECONOMY.business.capex;
function card(g,lane,name,recipe,reward,extra) {
 const c=g.company; c.cardSeq++;
 return {id:`q${g.q}-${lane}-${c.cardSeq}`,lane,tier:extra.stage+1,name, catalog:name, blurb:extra.blurb,recipe,mixed:Object.keys(recipe).length>1,cluster:extra.stage>0, ...(extra.stage>0 ? {flagship:true} : {}),reward,q:g.q,status:'open',...extra};
}
export function businessCard(g) {
 const c=g.company;
 if(g.q===1 && !c.builds.some(b=>b.business)) return card(g,'product','Small-business inference',{...ECONOMY.starter.recipe},{revenue:ECONOMY.starter.revenue},{business:'vertical',stage:0,cashCost:ECONOMY.starter.capital,commercial:{cost:.15,growth:.042,risk:.02},blurb:'Your first customers. Revenue pays at this bell.'});
 const options=BUSINESSES.map(spec=>{
  const completed=c.builds.filter(b=>b.business===spec[0]); const stage=completed.length;
  return {spec,stage,last:completed.at(-1)};
 }).filter(({spec,stage,last})=>stage<4&&(!last||(last.online===1))&&c.level>=spec[6]);
 if(!options.length) return null;
 const top=Math.max(...options.map(x=>x.stage)), pool=options.filter(x=>x.stage===top);
 const {spec:s,stage}=stream(g.seed,'v1172-business',g.q).pick(pool), recipe=Object.fromEntries(Object.entries(s[2]).map(([k,n])=>[k,n*stepScale[stage]]));
 return card(g,'product',s[1][stage],recipe,{revenue:Math.round(s[3][stage]*ECONOMY.business.revenue[stage])}, {business:s[0],stage,...(stage>=1 && ['security','synthetic','biotech','finance','vertical'].includes(s[0]) ? {customer:s[1][stage]+' customer'} : {}),cashCost:capex[stage],commercial:{cost:s[4],growth:s[5]*.6,risk:s[7]},
  blurb:stage===0?'Launch a business. Grow it after delivery.':`Expand ${s[1][stage-1]}. New customers, new recurring revenue.`});
}
export function campusCard(g) {
 const c=g.company, built=c.builds.filter(b=>b.campus), stage=built.length, last=built.at(-1);
 const specs=[['Power-backed colocation',{H100:4,H200:2},'H200',4,1800000,1500000],['Regional inference campus',{H100:8,H200:8},'H200',10,6500000,5000000],['Hyperscaler capacity campus',{H200:16,B200:12},'B200',18,18000000,15000000],['Sovereign compute campus',{H100:16,H200:24,B200:24},'B200',32,40000000,35000000]];
 if(stage>=specs.length||last&&last.online<1)return null;
 const [name,recipe,gpu,qty,lease,cashCost]=specs[stage];

 return card(g,'infra',name,recipe,{rack:{gpu,qty,fleet:true},lease},{campus:true,stage,cashCost,commercial:{cost:.30,growth:.04,risk:.02},blurb:'Owned power and capacity. Lease income plus GPUs each round.'});
}
export const HIRES=Object.freeze([
 {id:'sales',name:'Enterprise sales leader',cost:8000000,salary:2500000,equity:0,commercial:.09,desc:'+3.15% commercial growth × effectiveness'},
 {id:'scientist',name:'Distinguished scientist',cost:18000000,salary:4500000,equity:150,research:.08,tier:2,desc:'+8% research quality × effectiveness'},
 // V22.5 researchers: tier = the company stage that attracts them (see researcherTier). Effects × effectiveness (50–130%).
 // research: run quality · breakthrough/setback: training-run odds (points) · ip: research IP value · agi: AGI odds (points) · margin: cost saving.
 {id:'ml-engineer',name:'Applied ML engineer',cost:3000000,salary:1200000,equity:0,research:.04,ip:.10,tier:1,researcher:true,desc:'+4% research quality, +10% research IP'},
 {id:'efficiency-lead',name:'Training efficiency lead',cost:4500000,salary:1600000,equity:0,research:.02,margin:.08,tier:1,researcher:true,desc:'8% operating-cost saving, +2% research quality'},
 {id:'breakthrough-chaser',name:'Breakthrough chaser',cost:12000000,salary:3000000,equity:100,research:.03,breakthrough:.06,setback:.04,tier:2,researcher:true,desc:'+6 pts training breakthrough odds, +4 pts setback risk'},
 {id:'evaluation-scientist',name:'Evaluation scientist',cost:12000000,salary:3000000,equity:100,ip:.25,commercial:.06,tier:2,researcher:true,desc:'+25% research IP, +2.1% commercial growth'},
 {id:'frontier-scientist',name:'Frontier scientist',cost:30000000,salary:6000000,equity:250,research:.08,breakthrough:.08,ip:.30,tier:3,researcher:true,desc:'+8% research quality, +8 pts breakthrough odds, +30% research IP'},
 {id:'scaling-architect',name:'Scaling-laws architect',cost:35000000,salary:7000000,equity:300,research:.05,breakthrough:.05,agi:.04,margin:.06,tier:3,researcher:true,desc:'+5 pts breakthrough odds, +4 pts AGI odds, 6% cost saving'},
 {id:'lab-founder',name:'Legendary lab founder',cost:70000000,salary:14000000,equity:600,research:.08,breakthrough:.12,setback:.06,ip:.60,agi:.08,tier:4,researcher:true,desc:'+12 pts breakthrough, +8 pts AGI, +60% IP; +6 pts setback risk'},
 {id:'systems',name:'Hyperscaler systems architect',cost:25000000,salary:5000000,equity:200,margin:.18,desc:'18% operating-cost saving × effectiveness'},
 {id:'growth',name:'Startup growth executive',cost:12000000,salary:3500000,equity:300,commercial:.18,desc:'+6.3% growth × effectiveness; wider outcome risk'},
 {id:'coo',name:'Scaling COO',cost:40000000,salary:6500000,equity:400,quality:.08,margin:.10,desc:'+8% outcome quality and 10% cost saving × effectiveness'},
 {id:'cro',name:'Chief Revenue Officer',cost:50000000,salary:8000000,equity:500,commercial:.20,desc:'+7% growth × effectiveness; 5% newly issued equity'},
]);
// V22.5 talent tiers by company valuation (cash + enterprise value, cents): Garage/Seed, Series A, Growth, Scale-up and up.
export const TALENT_TIERS=Object.freeze([0,200000000,1000000000,5000000000]);
export const researcherTier=v=>TALENT_TIERS.reduce((t,min,i)=>v>=min?i+1:t,1);
export const staffEffect=(c,key)=>(c.team||[]).reduce((n,h)=>n+(HIRES.find(x=>x.id===h.id)?.[key]||0)*h.effect,0);
// V22.5: every round from 2 can offer a researcher; odd rounds from 3 can offer any leader (as before). The
// talent pool follows the company's stage: stronger researchers only come to a company that has earned them,
// and the tier-weighted draw favors the best available while cheaper hires stay possible.
export const talentValue = g => Math.round(g.cash*100)+enterpriseValue(g.company); // what investors mark the company at today
export function hiringCard(g) {
 const c=g.company, odd=g.q%2===1;
 if(g.q<2||(c.team||[]).length>=3||c.builds.some(b=>b.reward.hire&&b.q===g.q))return null;
 const tier=researcherTier(talentValue(g));
 const pool=HIRES.filter(h=>!(c.team||[]).some(t=>t.id===h.id)&&Math.round(g.cash*100)>=2*h.salary&&(odd?g.q>=3&&(h.researcher||g.q>=6||h.equity<=200):!!h.researcher)&&(h.tier||1)<=tier&&(g.q>=6||h.equity<=600));
 if(!pool.length)return null;
 const r=stream(g.seed,'v1172-hire',g.q), h=r.weighted(pool.map(x=>({w:1+(x.tier||1)*(x.researcher?1:.5),v:x})));
 return card(g,'opportunity',h.name,{H200:2},{hire:h.id},{stage:0,kind:'hire',cashCost:h.cost,until:40,at:0,cluster:true,
 blurb:`${h.desc}. ${researcherPreview(g,h)}Salary $${(h.salary/100).toLocaleString('en-US')}/round; ${h.equity/100}% equity. Effectiveness 50–130%, fixed at the bell.`});
}
// What a hire would change, from the engine's own numbers (at 100% effectiveness): never a made-up figure.
export function researcherPreview(g,h) {
 if(!h.researcher&&!h.breakthrough)return '';
 const c=g.company, base=Math.min(.9,.16+(c.ops?.research||0)/2);
 const parts=[];
 if(h.breakthrough)parts.push(`Training breakthrough ${Math.round(base*100)}% → ${Math.round((base+h.breakthrough)*100)}%`);
 if(h.ip)parts.push(`research IP +${Math.round(h.ip*100)}%`);
 if(h.agi)parts.push(`AGI odds +${Math.round(h.agi*100)} pts`);
 return parts.length?parts.join(' · ')+'. ':'';
}
export function researchProject(g) {
 const c=g.company;
 if(c.researchClosed||c.level<1||g.q%2!==0)return null;
 const options=[['Model distillation','efficiency'],['Inference optimization','margin'],['RL synthetic curriculum','research'],['New reasoning architecture','quality'],['Automated experimentation','research'],['Research licensing partnership','ip']];
 const [name,type]=stream(g.seed,'v1172-specialty',g.q).pick(options);
 if(c.builds.some(b=>b.specialty===type))return null;
 return card(g,'opportunity',name,{H200:4+c.level,B200:2+c.level},{ip:20000000*c.level,specialty:type},{stage:0,kind:'specialty',specialty:type,cashCost:5000000*c.level,cluster:true,until:40,at:0,blurb:'Research IP plus a lasting operating advantage. Resolve at the bell.'});
}
// Recurring costs apply only to live commercial tranches; capacity reduces serving expense, never
// mints cash. Salaries are real burn even when a leader disappoints.
export function commercialBurn(c) {
 const owned=c.racks.reduce((n,r)=>n+Math.floor(r.qty*r.online),0);
 const margin=Math.min(.45,owned/500+staffEffect(c,'margin')+(c.specialties?.includes('margin') ? .08 : 0));
 return c.products.filter(p=>p.online>0&&!p.lost&&p.commercial).reduce((n,p)=>n+Math.round(p.revenue*p.online*p.commercial.cost*(1-margin)),0)+(c.team||[]).reduce((n,h)=>n+HIRES.find(x=>x.id===h.id).salary,0);
}
export function commerceReward(g,b) {
 const c=g.company;
 if(b.online<1||b.commerceApplied)return;
 if(b.reward.hire) {
  const h=HIRES.find(h=>h.id===b.reward.hire); if(!h||c.team.some(t=>t.id===h.id)||c.team.length>=3)return;
  const effect=Math.round(stream(g.seed,'v117-leadership',b.id).range(h.id === 'growth' ? .5 : .7,1.3)*100)/100;
  c.team.push({id:h.id,build:b.id,effect,q:g.q});
  if(h.equity) { const total=c.shares.founder+c.shares.investors.reduce((n,i)=>n+i.shares,0); c.shares.investors.push({name:h.name,kind:'leadership',shares:Math.round(total*h.equity/(10000-h.equity)),paid:0,q:g.q,hire:b.id}); }
 }
 if(b.reward.specialty&&!c.specialties.includes(b.reward.specialty))c.specialties.push(b.reward.specialty);
 b.commerceApplied=true;
}
export function growProduct(c,p) {
 const specialty=c.specialties?.includes('efficiency') ? .03 : 0;
 const growth=p.lease ? (p.commercial?.growth ?? .03) : p.commercial ? Math.min(.24,p.commercial.growth+staffEffect(c,'commercial')*.35+specialty):.03;
 return Math.round(p.revenue*(1+growth));
}

// Verify persisted commercial identity, deterministic leadership results and exact zero-cash grants.
export function validCommerce(g) {
 const c=g.company, int=Number.isSafeInteger;
 for(const h of c.team||[]) {
  const spec=HIRES.find(x=>x.id===h.id), b=c.builds.find(x=>x.id===h.build);
  if(!spec||!b||!b.commerceApplied||b.online!==1)return false;
  const expected=Math.round(stream(g.seed,'v117-leadership',b.id).range(spec.id === 'growth' ? .5 : .7,1.3)*100)/100;
  if(h.effect!==expected)return false;
 }
 let total=c.shares.founder;
 for(const i of c.shares.investors) {
  if(i.kind==='leadership') {
   const h=c.team.find(h=>h.build===i.hire), spec=h&&HIRES.find(x=>x.id===h.id);
   if(!spec||!spec.equity||i.paid!==0||i.shares!==Math.round(total*spec.equity/(10000-spec.equity)))return false;
  }
  total+=i.shares;
 }
 for(const b of c.builds) {
  if(b.business) {
   const spec=businessSpec(b.business), prior=c.builds.slice(0,c.builds.indexOf(b)).filter(x=>x.business===b.business);
   if(!spec||!int(b.stage)||b.stage!==prior.length||prior.some(x=>x.online!==1))return false;
   if(JSON.stringify(b.commercial)!==JSON.stringify({cost:spec[4],growth:spec[5]*.6,risk:spec[7]}))return false;
   const current = ((b.cashCost || 0) === 0 || b.cashCost === capex[b.stage]) && b.reward.revenue === Math.round(spec[3][b.stage]*ECONOMY.business.revenue[b.stage]);
   const starter = b.q===1 && b.business==='vertical' && b.stage===0 && ((b.cashCost || 0) === 0 || b.cashCost===ECONOMY.starter.capital) && b.reward.revenue===ECONOMY.starter.revenue && JSON.stringify(b.recipe)===JSON.stringify(ECONOMY.starter.recipe);
   if (!current && !starter) return false;
  }
  if(b.reward.hire) { const h=HIRES.find(x=>x.id===b.reward.hire); if(!h||((b.cashCost||0)!==0&&b.cashCost!==h.cost))return false; }
  if(b.pilotResult) {
   if(!b.reward.pilotRevenue||b.online!==1)return false;
   if(c.products.filter(p=>p.build===b.id).length!==(b.pilotResult==='customer'?1:0))return false;
  }
 }
 for(const p of c.products) if(p.commercial) {
  const b=c.builds.find(b=>b.id===p.build);
  if(!b?.commercial||JSON.stringify(p.commercial)!==JSON.stringify(b.commercial))return false;
 }
 const x=g.arcade.exit;
 if(x?.realized !== undefined) {
  const remaining=x.kind==='secondary' ? x.founderPct*.75 : ['ipo','private'].includes(x.kind) ? x.founderPct : 0;
  const realized=['ipo','private'].includes(x.kind) ? 0 : x.kind==='secondary' ? Math.floor(x.payout*.25) : x.payout;
  if(![x.realized,x.retained].every(n=>int(n)&&n>=0)||x.realized+x.retained!==x.payout||x.remainingOwnership!==remaining||x.realized!==realized)return false;
 }
 return true;
}

export function businessNext(card) {
 const s=businessSpec(card.business), stage=card.stage+1;
 if(!s||stage>=4)return null;
 return {name:s[1][stage],level:s[6],capital:capex[stage],revenue:Math.round(s[3][stage]*ECONOMY.business.revenue[stage]),recipe:Object.fromEntries(Object.entries(s[2]).map(([k,n])=>[k,n*stepScale[stage]]))};
}
