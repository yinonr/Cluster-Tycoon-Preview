// Fortune Builder: explicit, finite staged businesses. All amounts are integer cents.
// A stage adds new customers/capacity; the old tranche keeps earning. No replacement double count.
import { ECONOMY } from './economy-balance.js';
import { stream } from '../util.js';
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
 {id:'scientist',name:'Distinguished scientist',cost:18000000,salary:4500000,equity:150,research:.08,desc:'+8% research quality × effectiveness'},
 {id:'systems',name:'Hyperscaler systems architect',cost:25000000,salary:5000000,equity:200,margin:.18,desc:'18% operating-cost saving × effectiveness'},
 {id:'growth',name:'Startup growth executive',cost:12000000,salary:3500000,equity:300,commercial:.18,desc:'+6.3% growth × effectiveness; wider outcome risk'},
 {id:'coo',name:'Scaling COO',cost:40000000,salary:6500000,equity:400,quality:.08,margin:.10,desc:'+8% outcome quality and 10% cost saving × effectiveness'},
 {id:'cro',name:'Chief Revenue Officer',cost:50000000,salary:8000000,equity:500,commercial:.20,desc:'+7% growth × effectiveness; 5% newly issued equity'},
]);
export const staffEffect=(c,key)=>(c.team||[]).reduce((n,h)=>n+(HIRES.find(x=>x.id===h.id)?.[key]||0)*h.effect,0);
export function hiringCard(g) {
 const c=g.company;
 if(g.q<3||(c.team||[]).length>=3||c.builds.some(b=>b.reward.hire&&b.q===g.q)||g.q%2===0)return null;
 const pool=HIRES.filter(h=>!(c.team||[]).some(t=>t.id===h.id)&&Math.round(g.cash*100)>=h.cost+2*h.salary&&(g.q>=6||h.equity<=200));
 if(!pool.length)return null;
 const h=stream(g.seed,'v1172-hire',g.q).pick(pool);
 return card(g,'opportunity',h.name,{H200:2},{hire:h.id},{stage:0,kind:'hire',cashCost:h.cost,until:40,at:0,cluster:true,
 blurb:`${h.desc}. Salary $${(h.salary/100).toLocaleString('en-US')}/round; ${h.equity/100}% equity. Effectiveness 50–130%, fixed at the bell.`});
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
   const current = b.cashCost === capex[b.stage] && b.reward.revenue === Math.round(spec[3][b.stage]*ECONOMY.business.revenue[b.stage]);
   const starter = b.q===1 && b.business==='vertical' && b.stage===0 && b.cashCost===ECONOMY.starter.capital && b.reward.revenue===ECONOMY.starter.revenue && JSON.stringify(b.recipe)===JSON.stringify(ECONOMY.starter.recipe);
   if (!current && !starter) return false;
  }
  if(b.reward.hire) { const h=HIRES.find(x=>x.id===b.reward.hire); if(!h||b.cashCost!==h.cost)return false; }
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
