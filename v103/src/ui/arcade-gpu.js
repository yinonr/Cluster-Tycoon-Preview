export const GPU_ROLE={H100:{},H200:{},B200:{}};
const paths={H100:'M5 5h14v14H5z M9 9h6v6H9z M8 2v3m8-3v3M8 19v3m8-3v3M2 8h3m14 0h3M2 16h3m14 0h3',H200:'M3 6h18v12H3z M6 9h4v6H6z M14 9h4v6h-4z M6 18v3m4-3v3m4-3v3m4-3v3',B200:'M12 2l9 5v10l-9 5-9-5V7z M12 6l5 6-5 6-5-6z M3 7l4 3m10 4 4 3M3 17l4-3m10-4 4-3'};
export const gpuBadge=gpu=>GPU_ROLE[gpu]?`<span class="gpu ${gpu}" aria-label="${gpu}"><svg class="gpu-emblem" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[gpu]}"/></svg> ${gpu}</span>`:'';
export const gpuLabel=gpu=>gpu;
