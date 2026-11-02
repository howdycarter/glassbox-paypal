// Verification harness — asserts the scenario design and the engine/scoring
// arithmetic the demo's claims rest on. Run: npm run verify.
// These are the repo's own assertions; the repo has no CI and the count is
// never described as CI.

import { scenario, TRAP_DP_ID, RELIABILITY_BASELINE } from '../src/data/scenario';
import { recommend, simulate, scoreRun } from '../src/lib/engine';
import { MockTransport } from '../src/lib/transports';
import type { OperatorAction } from '../src/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
  }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// --- Scenario design -------------------------------------------------------
check('scenario has exactly 5 decision points', scenario.length === 5);
check('decision point ids are unique', new Set(scenario.map((d) => d.id)).size === 5);
check(
  'ground truth: 4 ACCEPT / 1 OVERRIDE (80% reliability baseline)',
  scenario.filter((d) => d.correctAction === 'ACCEPT').length === 4 &&
    scenario.filter((d) => d.correctAction === 'OVERRIDE').length === 1,
);
check('the single OVERRIDE point is the trap', scenario.find((d) => d.correctAction === 'OVERRIDE')?.id === TRAP_DP_ID);
check('RELIABILITY_BASELINE constant matches the scenario', near(RELIABILITY_BASELINE, 0.8));
check(
  'payee name mismatch exists only at the trap',
  scenario.every((d) => (d.proposal.payeeName !== d.proposal.payeeVerifiedName) === (d.id === TRAP_DP_ID)),
);
check('every decision point carries >= 3 provenance items', scenario.every((d) => d.provenance.length >= 3));
check(
  'trap instruction is marked as originating in listing content',
  scenario.find((d) => d.id === TRAP_DP_ID)?.signals.instructionFromListingContent === true,
);
check(
  'trap verified instruction trust is far below its claimed trust',
  (() => {
    const t = scenario.find((d) => d.id === TRAP_DP_ID)!;
    return t.signals.verifiedInstructionTrust < 0.25 && t.signals.claimedInstructionTrust > 0.9;
  })(),
);

// --- Engine ----------------------------------------------------------------
const recs = new Map(scenario.map((d) => [d.id, recommend(d)]));
check('engine recommends PAY on all 5 points (trap included)', scenario.every((d) => recs.get(d.id)!.action === 'PAY'));
check('trap confidence is high (>= 70) — the trap must be tempting', recs.get(TRAP_DP_ID)!.confidence >= 70);
check('clean restock confidence is highest or near (>= 80)', recs.get('DP-1')!.confidence >= 80);
check('stale-feed point is hard-capped at 55', recs.get('DP-4')!.confidence <= 55 && recs.get('DP-4')!.confidence >= 50);
check(
  'staleness cap driver is present at DP-4',
  recs.get('DP-4')!.drivers.some((d) => d.label === 'Staleness cap'),
);
check(
  'engine is deterministic (same input, same recommendation)',
  scenario.every((d) => JSON.stringify(recommend(d)) === JSON.stringify(recs.get(d.id))),
);
check(
  'driver points sum to the pre-cap confidence at trap',
  (() => {
    const r = recs.get(TRAP_DP_ID)!;
    const sum = r.drivers.reduce((a, d) => a + d.points, 0);
    return sum === r.confidence; // trap is uncapped, so sum == confidence
  })(),
);

// --- Scoring ---------------------------------------------------------------
function runWith(actions: OperatorAction[]) {
  return scoreRun(
    scenario.map((d, i) => simulate(d, actions[i], recs.get(d.id)!)),
    scenario,
  );
}
const perfect = runWith(['ACCEPT', 'ACCEPT', 'OVERRIDE', 'ACCEPT', 'ACCEPT']);
check('perfect operator: appropriate reliance = 1.0', near(perfect.appropriateReliance, 1));
check('perfect operator: over-reliance = 0', near(perfect.overReliance, 0));
check('perfect operator: under-reliance = 0', near(perfect.underReliance, 0));
check('perfect operator: trap caught (error recovery)', perfect.errorRecovery === true);
check('system reliability reads back as 0.8', near(perfect.systemReliability, 0.8));

const rubberStamp = runWith(['ACCEPT', 'ACCEPT', 'ACCEPT', 'ACCEPT', 'ACCEPT']);
check('rubber-stamp operator: appropriate reliance = 0.8', near(rubberStamp.appropriateReliance, 0.8));
check('rubber-stamp operator: over-reliance = 1.0', near(rubberStamp.overReliance, 1));
check('rubber-stamp operator: trap missed', rubberStamp.errorRecovery === false);

const blockAll = runWith(['OVERRIDE', 'OVERRIDE', 'OVERRIDE', 'OVERRIDE', 'OVERRIDE']);
check('block-everything operator: appropriate reliance = 0.2', near(blockAll.appropriateReliance, 0.2));
check('block-everything operator: under-reliance = 1.0', near(blockAll.underReliance, 1));

// --- Mock transport ----------------------------------------------------------
const mock = new MockTransport();
const p = scenario[0].proposal;
const [m1, m2] = [await mock.createOrder(p), await mock.createOrder(p)];
check('mock transport is labeled mock', m1.mode === 'mock' && m1.status === 'SIMULATED');
check('mock transport order ids are deterministic', m1.orderId === m2.orderId && m1.orderId.startsWith('MOCK-'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
