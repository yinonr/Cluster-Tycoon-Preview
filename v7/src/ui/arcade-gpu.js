export const GPU_ROLE={H100:{symbol:'◆',role:'Workhorse'},H200:{symbol:'▥',role:'Memory'},B200:{symbol:'✦',role:'Frontier'}};
export const gpuBadge=gpu=>GPU_ROLE[gpu]?`<span class="gpu ${gpu}" title="${GPU_ROLE[gpu].role} gameplay role">${GPU_ROLE[gpu].symbol} ${gpu} · ${GPU_ROLE[gpu].role}</span>`:'';
export const gpuLabel=gpu=>GPU_ROLE[gpu]?`${GPU_ROLE[gpu].symbol} ${gpu}`:gpu;
