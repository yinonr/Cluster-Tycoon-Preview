import { esc } from '../util.js';
import { gpuBadge } from './arcade-gpu.js';
export function fortuneReport(line,money) {
  const f=line.fortune;if(!f)return '';
  return `<div class="startup-bulletin"><h3>${esc(line.name)} · ${esc(f.headline)}</h3><p>${f.delivered}/${f.requested} ${gpuBadge(f.gpu)} delivered${f.critical?' · critical deadline':''}.</p><p>Your service contribution: ${f.serviceGrowth>=0?'+':''}${(f.serviceGrowth*100).toFixed(0)} growth points${f.launch?' including a seeded milestone outcome':''}; failure-risk multiplier ${f.failFactor.toFixed(2)}. ${f.burnPenalty?`Missed target consumed ${money(f.burnPenalty*100)} of runway.`:''} Commercial outcomes remain uncertain.</p><p>${esc(f.status)} · actual growth ${Math.round(f.growth*100)}% · valuation ${money(f.beforeVal*100)} → ${money(f.valuation*100)}.</p><p>Ownership ${(f.beforeStake*100).toFixed(3)}% → ${(f.ownership*100).toFixed(3)}% · ${money(Math.round(f.paper*100))} paper · ${f.runway.toFixed(1)} quarters runway.</p><p>${f.nextGPU?`Next likely need: ${gpuBadge(f.nextGPU)}.`:'No next order.'}</p></div>`;
}
