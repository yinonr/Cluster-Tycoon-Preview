// Live entries are deliberately a small subset. Staged entries share the validated contract.
const stage = (name, recipe, reward) => ({ name, recipe, reward });
export const PARTNERSHIPS = [
  { id: 'atlas', live: true, name: 'Project Atlas', pitch: 'Helios wants proof before a production commitment.', stages: [
    stage('Proof of concept', { H100: 2, H200: 1 }, { cash: 1100000 }),
    stage('Paid pilot', { H200: 3, B200: 1 }, { cash: 3900000 }),
    stage('Production rollout', { H200: 3, B200: 4 }, { revenue: 1250000 }),
  ] },
  { id: 'meridian', live: true, name: 'Meridian Health', pitch: 'A hospital network will pay for a reliable staged deployment.', stages: [
    stage('Validation ward', { H100: 2, H200: 1 }, { cash: 1500000 }),
    stage('Regional deployment', { H100: 4, H200: 3 }, { revenue: 1000000 }),
  ] },
  { id: 'openlab', live: true, name: 'Open Lab', pitch: 'An academic collaboration has a commercial customer waiting.', stages: [
    stage('Replication study', { H100: 1, H200: 2 }, { cash: 900000 }),
    stage('Industrial trial', { H200: 2, B200: 2 }, { cash: 4000000 }),
    stage('Commercial license', { H100: 2, B200: 4 }, { revenue: 1150000 }),
  ] },
  { id: 'harbor', live: false, name: 'Harbor Cloud', pitch: 'Earn an anchor tenancy by proving regional failover.', stages: [
    stage('Failover trial', { H100: 3, H200: 1 }, { cash: 1600000 }),
    stage('Anchor deployment', { H200: 4, B200: 2 }, { revenue: 1100000 }),
  ] },
  { id: 'forge', live: false, name: 'Factory Forge', pitch: 'One production line first, then the entire factory.', stages: [
    stage('Vision inspection', { H100: 3 }, { cash: 1200000 }),
    stage('Factory rollout', { H100: 6, H200: 3 }, { revenue: 1050000 }),
  ] },
  { id: 'frontier', live: false, name: 'Frontier Relay', pitch: 'A research lab needs an independent evaluation partner.', stages: [
    stage('Evaluation harness', { H200: 2, B200: 1 }, { cash: 1600000 }),
    stage('Safety trial', { H200: 2, B200: 3 }, { cash: 4700000 }),
    stage('Evaluation service', { H200: 4, B200: 4 }, { revenue: 1350000 }),
  ] },
  { id: 'civic', live: false, name: 'Civic Grid', pitch: 'A city agency will procure only after a public pilot.', stages: [
    stage('District pilot', { H100: 2, H200: 2 }, { cash: 1800000 }),
    stage('City deployment', { H100: 5, H200: 4 }, { revenue: 1100000 }),
  ] },
];
const offer = (id, live, name, pitch, factor, tranches) => ({ id, live, name, pitch, factor, tranches });
const units = (gpu, qty, after, delay = 0) => ({ gpu, qty, after, delay });
export const COMPUTE_OFFERS = [
  offer('frontier-reserve', true, 'Frontier Compute Fund', 'B200 access, not a payroll wire. The last shipment has a one-round shipping delay.', .90,
    [units('B200', 2, 0), units('B200', 2, 1), units('B200', 2, 2, 1)]),
  offer('cloud-runway', true, 'Harbor Infrastructure', 'An H100 runway for customer deployments. Cash might buy a different mix.', .95,
    [units('H100', 3, 0), units('H100', 3, 1), units('H100', 3, 2)]),
  offer('mixed-sponsor', true, 'Relay Ventures', 'A mixed cluster today, a second delivery next round. Integration is your responsibility.', 1,
    [units('H200', 2, 0), units('B200', 2, 0), units('H200', 2, 1), units('B200', 1, 1)]),
  offer('shortage-bridge', true, 'Emergency Rack Partners', 'Immediate frontier capacity at a premium. No cash, no future shipments.', 1.12,
    [units('B200', 4, 0)]),
  offer('lab-endowment', false, 'Independent Lab Capital', 'A patient research allocation, with nothing delivered today.', .85,
    [units('B200', 3, 1), units('B200', 3, 2)]),
  offer('enterprise-reserve', false, 'Enterprise Compute Trust', 'Serving capacity for a growing enterprise backlog.', .94,
    [units('H200', 3, 0), units('H200', 3, 1)]),
  offer('regional-cloud', false, 'Regional Cloud Partners', 'Older hardware now, premium capacity after migration.', .90,
    [units('H100', 4, 0), units('H200', 4, 2)]),
  offer('export-window', false, 'Pacific Capacity Fund', 'A disclosed customs delay buys a lower contractual price.', .80,
    [units('B200', 3, 0, 1), units('B200', 3, 1, 1)]),
  offer('inference-backer', false, 'Inference Angels', 'A small early serving allocation with a modest equity ask.', .96,
    [units('H100', 2, 0), units('H200', 2, 1)]),
];
// These are consequential variants of a stage, not additional popup notifications.
export const FOLLOWUPS = [
  { id: 'atlas-security', live: true, chain: 'atlas', stage: 1, headline: 'Security review adds one H100 to the pilot.', add: { H100: 1 }, cash: 1.12 },
  { id: 'atlas-rival', live: true, chain: 'atlas', stage: 2, headline: 'A rival undercuts the rollout. Helios offers 15% less revenue.', revenue: .85 },
  { id: 'atlas-expansion', live: true, chain: 'atlas', stage: 2, headline: 'A second region joins: one more H200, 15% more revenue.', add: { H200: 1 }, revenue: 1.15 },
  { id: 'meridian-audit', live: true, chain: 'meridian', stage: 1, headline: 'An audit adds a redundant H200 to the deployment.', add: { H200: 1 }, revenue: 1.1 },
  { id: 'meridian-budget', live: true, chain: 'meridian', stage: 1, headline: 'Procurement trims the award by 10%. The contract remains open.', revenue: .9 },
  { id: 'openlab-reproduce', live: true, chain: 'openlab', stage: 1, headline: 'The customer requests a larger replication run.', add: { H100: 2 }, cash: 1.18 },
  { id: 'openlab-license', live: true, chain: 'openlab', stage: 2, headline: 'Exclusive licensing adds 15% revenue, but needs another B200.', add: { B200: 1 }, revenue: 1.15 },
  { id: 'harbor-failover', live: false, chain: 'harbor', stage: 1, headline: 'A second failover site needs two more H100s.', add: { H100: 2 }, revenue: 1.15 },
  { id: 'forge-safety', live: false, chain: 'forge', stage: 1, headline: 'Safety certification adds a dedicated H200.', add: { H200: 1 }, revenue: 1.1 },
  { id: 'frontier-release', live: false, chain: 'frontier', stage: 2, headline: 'A new model release increases evaluation demand.', add: { B200: 1 }, revenue: 1.15 },
  { id: 'civic-budget', live: false, chain: 'civic', stage: 1, headline: 'The council cuts the contract by 15%.', revenue: .85 },
  { id: 'civic-access', live: false, chain: 'civic', stage: 1, headline: 'Accessibility deployment adds two H100s and 10% revenue.', add: { H100: 2 }, revenue: 1.1 },
];
