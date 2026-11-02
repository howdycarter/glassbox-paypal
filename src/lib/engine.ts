import type {
  ConfidenceDriver,
  DecisionPoint,
  DecisionRecord,
  Debrief,
  OperatorAction,
  Recommendation,
} from '../types';
import { TRAP_DP_ID } from '../data/scenario';

// The deterministic recommender. Its arithmetic is part of the exhibit: every
// confidence figure decomposes into the drivers below, computed identically
// for the live decision and for any what-if recomputation.
//
// THE FLAW, stated plainly (it is the evaluation core of the vignette):
// the engine scores the payment-instruction channel by its CLAIMED authority,
// and when an instruction arrives as seller-provided content it applies a
// standing precedence rule — "seller payment instructions outrank catalog
// data" — which re-attributes price deviations to the seller's updated terms
// and sets contradiction penalties aside. Provenance verification data
// (verifiedInstructionTrust, instruction source, payee-of-record) is carried
// on the decision point and shown on the glass-box surface, but the engine
// does not score it. That gap between scored trust and verified trust is
// exactly what the operator is there to catch — and what the debrief measures.

const STALE_CAP_MINUTES = 720;
const STALE_CONFIDENCE_CAP = 55;
const PAY_THRESHOLD = 50;

export function recommend(dp: DecisionPoint): Recommendation {
  const s = dp.signals;
  const drivers: ConfidenceDriver[] = [];

  let confidence = 45;
  drivers.push({ label: 'Base rate', points: 45, note: 'Standing prior for agent-proposed payments.' });

  // Price alignment vs the 90-day median.
  if (s.instructionFromListingContent) {
    drivers.push({
      label: 'Price (per seller instruction)',
      points: 4,
      note: `Unit price is ${(s.priceRatio * 100 - 100).toFixed(0)}% above the catalog median, attributed to the seller's updated terms under the precedence rule. The benchmark penalty is not applied.`,
    });
    confidence += 4;
  } else if (s.priceRatio >= 1) {
    const pts = -Math.round((s.priceRatio - 1) * 60);
    drivers.push({
      label: 'Price alignment',
      points: pts,
      note: `Unit price ${(s.priceRatio * 100 - 100).toFixed(0)}% above the 90-day median.`,
    });
    confidence += pts;
  } else {
    const pts = Math.round((1 - s.priceRatio) * 25);
    drivers.push({
      label: 'Price alignment',
      points: pts,
      note: `Unit price ${((1 - s.priceRatio) * 100).toFixed(0)}% below the 90-day median.`,
    });
    confidence += pts;
  }

  const sellerPts = Math.round((s.sellerTrust - 0.5) * 30);
  drivers.push({
    label: 'Seller track record',
    points: sellerPts,
    note: `Fulfillment history score ${(s.sellerTrust * 100).toFixed(0)}/100.`,
  });
  confidence += sellerPts;

  const instrPts = Math.round((s.claimedInstructionTrust - 0.5) * 30);
  drivers.push({
    label: 'Instruction authority (as claimed)',
    points: instrPts,
    note: s.instructionFromListingContent
      ? 'Scored from the authority the instruction claims for itself. Provenance verification is displayed on the surface but is NOT scored by this engine.'
      : 'Instruction channel scored from its claimed authority; provenance verification agrees.',
  });
  confidence += instrPts;

  const agreePts = Math.round((s.evidenceAgreement - 0.5) * 20);
  drivers.push({
    label: 'Evidence agreement',
    points: agreePts,
    note: `${(s.evidenceAgreement * 100).toFixed(0)}% agreement across independent feeds.`,
  });
  confidence += agreePts;

  // Contradiction penalty — set aside under the precedence rule when the
  // instruction is seller-provided (the flaw, again, in arithmetic).
  if (dp.contradictions.length > 0) {
    if (s.instructionFromListingContent) {
      drivers.push({
        label: 'Contradictions',
        points: 0,
        note: `${dp.contradictions.length} contradiction(s) on record, set aside under the seller-instruction precedence rule. They remain visible on the glass-box surface.`,
      });
    } else {
      const pts = -4 * dp.contradictions.length;
      drivers.push({
        label: 'Contradictions',
        points: pts,
        note: `${dp.contradictions.length} contradiction(s) surfaced and priced in.`,
      });
      confidence += pts;
    }
  }

  // Staleness cap: degraded data visibly collapses confidence.
  if (s.stalestInputMinutes > STALE_CAP_MINUTES) {
    drivers.push({
      label: 'Staleness cap',
      points: 0,
      note: `Stalest input is ${Math.round(s.stalestInputMinutes / 60)}h old; confidence hard-capped at ${STALE_CONFIDENCE_CAP}.`,
    });
    confidence = Math.min(confidence, STALE_CONFIDENCE_CAP);
  }

  confidence = Math.max(3, Math.min(97, Math.round(confidence)));

  return {
    action: confidence >= PAY_THRESHOLD ? 'PAY' : 'BLOCK',
    confidence,
    drivers,
    ruleNote: s.instructionFromListingContent
      ? 'Standing rule applied: seller-provided payment instructions outrank catalog data. Instruction authority scored as claimed.'
      : 'Standing rule applied: pay when decomposed confidence clears the threshold; contradictions and staleness priced in.',
  };
}

/** Build a DecisionRecord the way the UI does (used by the verify harness). */
export function simulate(
  dp: DecisionPoint,
  operatorAction: OperatorAction,
  recommendation: Recommendation,
  latencyMs = 0,
): DecisionRecord {
  const recommendedCorrect =
    (recommendation.action === 'PAY' && dp.correctAction === 'ACCEPT') ||
    (recommendation.action === 'BLOCK' && dp.correctAction === 'OVERRIDE');
  const operatorFollowed = operatorAction === 'ACCEPT';
  // The operator is correct when following a right recommendation or
  // overriding a wrong one.
  const correct = operatorFollowed === recommendedCorrect;
  return { dpId: dp.id, recommendation, operatorAction, latencyMs, correct };
}

export function scoreRun(records: DecisionRecord[], points: DecisionPoint[]): Debrief {
  const byId = new Map(points.map((p) => [p.id, p]));
  let correctCount = 0;
  let wrongRecs = 0;
  let wrongAccepted = 0;
  let rightRecs = 0;
  let rightOverridden = 0;
  let accepted = 0;
  let latencySum = 0;
  let errorRecovery = false;

  for (const r of records) {
    const dp = byId.get(r.dpId);
    if (!dp) continue;
    const recRight =
      (r.recommendation.action === 'PAY' && dp.correctAction === 'ACCEPT') ||
      (r.recommendation.action === 'BLOCK' && dp.correctAction === 'OVERRIDE');
    if (r.correct) correctCount += 1;
    if (r.operatorAction === 'ACCEPT') accepted += 1;
    if (!recRight) {
      wrongRecs += 1;
      if (r.operatorAction === 'ACCEPT') wrongAccepted += 1;
    } else {
      rightRecs += 1;
      if (r.operatorAction === 'OVERRIDE') rightOverridden += 1;
    }
    if (r.dpId === TRAP_DP_ID) errorRecovery = r.correct;
    latencySum += r.latencyMs;
  }

  const total = records.length;
  return {
    total,
    appropriateReliance: total ? correctCount / total : 0,
    overReliance: wrongRecs ? wrongAccepted / wrongRecs : 0,
    underReliance: rightRecs ? rightOverridden / rightRecs : 0,
    relianceShare: total ? accepted / total : 0,
    systemReliability: total ? rightRecs / total : 0,
    errorRecovery,
    avgLatencyMs: total ? latencySum / total : 0,
  };
}
