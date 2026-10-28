// V10.19 Kernel Snake (engine). Contract: docs/V10_19_INTEGRATION_CONTRACT.md. Not built yet at the architecture
// checkpoint: the adapter is declared (ready: false) and the registry plays Node Tetris in its place.
export const ADAPTER = Object.freeze({
  kind: 'kernel', field: 'kernel', name: 'Kernel Snake', ready: false,
  start: () => false, input: () => false, tick: () => false, skip: () => false, outcome: () => null, autoplay: () => false,
  valid: () => false,
});
