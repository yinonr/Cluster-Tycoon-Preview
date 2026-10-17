// GPU IDENTITIES (Tycoon mode). Gameplay identities, not benchmarks: a GPU's power for a
// workload is the game's existing abstraction (Venture Mode's serve/train power per GPU,
// src/venture/constants.js: H100 1.0/1.0, H200 1.3/1.5, B200 1.8/2.4). Against the board's
// rates (B200 about 1.9× an H100) that already says: for training, B200 is the best compute
// per dollar. Standard serving: the models fit, so a GPU-hour is a GPU-hour and the cheapest
// GPU (H100) is the match. "Long-context serving" takes the serving power and needs a
// high-memory GPU (H200 or B200): there, H200 is the match. Each GPU has a job it's best at.

import { C } from '../venture/constants.js';
import { esc } from '../util.js';

export const GPU_ID = {
  H100: { role: 'The workhorse', cls: 'g-h100' },
  H200: { role: 'Memory advantage', cls: 'g-h200' },
  B200: { role: 'Frontier compute', cls: 'g-b200' },
};
export const GPU_LIST = ['H100', 'H200', 'B200'];

export const WORK = {
  serve: { label: 'serving', accepts: ['H100', 'H200', 'B200'], power: { H100: 1, H200: 1, B200: 1 } },
  memory: { label: 'long-context serving', accepts: ['H200', 'B200'], power: C.serve },
  train: { label: 'training', accepts: ['H100', 'H200', 'B200'], power: C.train },
};

export const powerOf = (work, gpu) => (WORK[work] && WORK[work].power[gpu]) || 0;

// What a GPU-hour of this GPU is worth to this work, in H100-hours at the H100's board rate.
export const valueAt = (work, gpu, bench) => (powerOf(work, gpu) / powerOf(work, 'H100')) * bench.H100;

// MATCH: the best compute per dollar (at the board) among the GPUs the work accepts;
// WORKS: accepted, not the best value; WRONG TYPE: not accepted.
export function fitOf(work, gpu, bench) {
  const w = WORK[work];
  if (!w || !w.accepts.includes(gpu)) return 'wrong';
  const per = (g) => powerOf(work, g) / bench[g];
  const best = w.accepts.filter((g) => bench[g] != null).sort((a, b) => per(b) - per(a))[0];
  return gpu === best ? 'match' : 'works';
}
export const FIT_LABEL = { match: 'MATCH', works: 'WORKS', wrong: 'WRONG TYPE' };

export const badge = (gpu) => `<b class="gpu-badge ${GPU_ID[gpu] ? GPU_ID[gpu].cls : 'g-other'}" title="${esc(GPU_ID[gpu] ? GPU_ID[gpu].role : gpu)}">${esc(gpu)}</b>`;
export const fitTag = (fit) => `<i class="fit-tag fit-${fit}">${FIT_LABEL[fit]}</i>`;
