// Explicit V7.4 adapter around the existing startup lifecycle; no protected-mode draws.
import { stream } from '../util.js';
const stages=['Prototype','Pilot','Launch','Scaling','Breakthrough'];
export function startupInfluence(game,s) {
  if(game.arcade?.version!==103)return null;
  const o=game.arcade.orders.find(o=>o.client===s.id);
  if(!o)return null;
  const p=s.v74 ||= {level:0,streak:0,met:0,missed:0,stage:'Prototype'};
  const ratio=o.delivered/o.qty, full=ratio===1, critical=!!o.critical;
  p.streak=full?p.streak+1:0; if(full)p.met++;else if(critical)p.missed++;
  const r=stream(game.seed,'v74-fortunes',s.id,game.q);
  const launch=full&&r.next()<Math.min(.88,.35+s.quality*.35+p.streak*.06);
  // Denser V9 supply makes consecutive full orders attainable. Bound the service
  // boost so routine fulfillment does not compound into automatic equity jackpots.
  const growth=.10*ratio+(full?.02*Math.min(3,p.streak):0)+(launch?.08:0)-(critical&&!full?.16*(1-ratio):0);
  const burnPenalty=critical&&!full?Math.round(s.burn*.25*(1-ratio)):0;
  s.cash-=burnPenalty;
  if(launch){p.level=Math.min(4,p.level+1);if(p.level>=3)s.work='train';else if(p.level>=2&&s.work==='serve')s.work='memory';}
  p.stage=stages[p.level];
  return {ratio,full,critical,launch,growth,failFactor:Math.max(.35,1-.5*ratio-.08*Math.min(3,p.streak))+(critical&&!full?.5*(1-ratio):0),funding:launch&&r.next()<.65,burnPenalty,beforeVal:s.val,beforeStake:s.stake,delivered:o.delivered,requested:o.qty,gpu:o.gpu,stage:p.stage};
}
export function recordFortune(game,s,line,effect) {
  if(!effect)return;
  const status=!s.alive?'Shut down':s.exited?'Acquired':s.cash< s.burn?'Funding crisis':effect.stage;
  s.v74.stage=status;
  line.fortune={...effect,status,serviceGrowth:effect.growth,valuation:s.val,growth:s.lastGrowth||0,ownership:s.stake,paper:s.stake*s.val,runway:Math.max(0,s.cash/Math.max(1,s.burn)),nextGPU:s.alive&&!s.exited?{serve:'H100',memory:'H200',train:'B200'}[s.work]:null,
    headline:!s.alive?'SHUT DOWN':s.exited?'ACQUIRED':effect.launch?`${effect.stage.toUpperCase()} MILESTONE REACHED`:effect.critical&&!effect.full?'CRITICAL COMPUTE TARGET MISSED':effect.full?'COMPUTE TARGET MET':effect.ratio?'PARTIAL COMPUTE SUPPORT':'COMPUTE TARGET UNFILLED'};
}
