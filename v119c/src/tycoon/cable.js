// V10.19 Cable Hell (engine). Contract: docs/V10_19_INTEGRATION_CONTRACT.md. Not built yet at the architecture
// checkpoint: the adapter is declared (ready: false) and the registry plays Node Tetris in its place.
export const ADAPTER = Object.freeze({
  kind: 'cable', field: 'cable', name: 'Cable Hell', ready: false,
  start: () => false, input: () => false, tick: () => false, skip: () => false, outcome: () => null, autoplay: () => false,
  valid: () => false,
});
