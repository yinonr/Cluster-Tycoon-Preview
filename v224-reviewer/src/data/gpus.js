// Fictional but believable reference rates, $/GPU-hour.
export const GPUS = {
  H100: { id: 'H100', base: 2.42, vol: 0.006 },
  H200: { id: 'H200', base: 3.08, vol: 0.007 },
  B200: { id: 'B200', base: 4.65, vol: 0.010 },
  A100: { id: 'A100', base: 1.32, vol: 0.004 },
  MI300X: { id: 'MI300X', base: 2.15, vol: 0.006 },
  L40S: { id: 'L40S', base: 0.92, vol: 0.003 },
};

export const BOARD_ORDER = ['H100', 'H200', 'B200', 'A100', 'MI300X', 'L40S'];

// Rate adjustment by contract term, relative to a 12-month quote.
// Longer commitments clear cheaper.
export const TERM_ADJ = { 3: 0.10, 6: 0.04, 12: 0, 24: -0.10 };

export const HOURS_PER_MONTH = 730;

export const contractValue = (qty, rate, months) => qty * rate * HOURS_PER_MONTH * months;
