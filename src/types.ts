// Glass-Box Checkout — shared types.
//
// The design mirrors the Glass-Box C2 prototype: a transparent, deterministic
// recommender issues a recommendation per decision point; the operator accepts
// or overrides; every step is written to a forensic log and scored against
// ground truth. Here the decision is a PayPal payment proposed by an AI
// purchasing agent, and the operator is the human who stays accountable for it.

export interface ProvenanceItem {
  /** What the input is, e.g. "Seller identity". */
  label: string;
  /** Where it came from, e.g. "Marketplace seller record (verified)". */
  source: string;
  /** Data age in minutes at decision time. */
  ageMinutes: number;
  /** Integrity flags raised on this input (empty = clean). */
  flags: string[];
}

export interface PaymentProposal {
  payeeName: string;
  /** Payee identity as verified against the storefront of record. */
  payeeVerifiedName: string;
  item: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: 'USD';
}

export interface DecisionPoint {
  id: string;
  title: string;
  /** Narrative shown to the operator before the recommendation. */
  brief: string;
  proposal: PaymentProposal;
  /**
   * Raw signals the engine scores. All values are scenario data; the engine's
   * arithmetic over them is the exhibit.
   */
  signals: {
    /** Proposed unit price vs the 90-day median for the item, as a ratio (1.0 = at median). */
    priceRatio: number;
    /** Seller track record 0..1 (tenure, fulfillment history). */
    sellerTrust: number;
    /**
     * Trust of the channel the payment instruction arrived through, 0..1 —
     * as CLAIMED by the instruction itself. See verifiedInstructionTrust.
     */
    claimedInstructionTrust: number;
    /** Trust of the instruction channel after provenance verification, 0..1. */
    verifiedInstructionTrust: number;
    /** Age of the stalest input the recommendation depends on, in minutes. */
    stalestInputMinutes: number;
    /** Agreement between independent evidence feeds, 0..1. */
    evidenceAgreement: number;
    /** True when the payment instruction originated inside untrusted listing content. */
    instructionFromListingContent: boolean;
  };
  provenance: ProvenanceItem[];
  /** Contradictions the surface must show (glass-box mode). */
  contradictions: string[];
  /** Ground truth: the action a perfectly informed operator should take. */
  correctAction: OperatorAction;
  /** Why that is the correct action — revealed only in the debrief. */
  groundTruthNote: string;
}

export type RecommendedAction = 'PAY' | 'BLOCK';
export type OperatorAction = 'ACCEPT' | 'OVERRIDE';

export interface ConfidenceDriver {
  label: string;
  /** Contribution to confidence, percentage points (may be negative). */
  points: number;
  note: string;
}

export interface Recommendation {
  action: RecommendedAction;
  /** 0..100, after caps and penalties. */
  confidence: number;
  drivers: ConfidenceDriver[];
  /** The standing rule that fired, stated plainly. Part of the exhibit. */
  ruleNote: string;
}

export interface LogEntry {
  t: string;
  kind: 'recommendation' | 'operator' | 'execution' | 'system';
  text: string;
}

export interface DecisionRecord {
  dpId: string;
  recommendation: Recommendation;
  operatorAction: OperatorAction;
  overrideReason?: string;
  /** Milliseconds from recommendation shown to operator action. */
  latencyMs: number;
  correct: boolean;
  executionNote?: string;
}

export interface Debrief {
  total: number;
  appropriateReliance: number; // (correct accepts + correct overrides) / total
  overReliance: number; // accepted a wrong recommendation / wrong recommendations
  underReliance: number; // overrode a right recommendation / right recommendations
  relianceShare: number; // share of recommendations accepted
  systemReliability: number; // share of recommendations that were right
  errorRecovery: boolean; // operator caught the trap decision point
  avgLatencyMs: number;
}
