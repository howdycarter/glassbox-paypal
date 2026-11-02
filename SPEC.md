# Glass-Box Checkout — Specification (v0.1)

**Newton & Carter LLC** — new build for the PayPal AI Hackathon ("Build What's Next with PayPal and AI", Devpost; submission period Oct 1 – Nov 12, 2026, 12:00 PM PT). Target lane: **Best Use of Agentic Commerce**, judged additionally on the five general criteria (Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation).

**Honesty frame.** Newton & Carter claims **no prior PayPal experience** (capability-inventory non-claim). This is new-build work, presented as such. The Glass-Box measurement method it applies is the firm's existing R&D: a working TRL-4 prototype (Glass-Box for human–AI decision support) with a deterministic recommender, ground-truthed vignettes, and an ablation design. This project ports that measurement method to a new domain — AI payment agents — during the hackathon window; it does not re-skin the C2 prototype's scenario or claims.

## Concept

AI purchasing agents are being given payment authority faster than anyone is measuring whether the humans nominally supervising them can actually supervise. Glass-Box Checkout is a **measurement instrument for that supervision**:

- An AI purchasing agent proposes PayPal payments for a small online seller's restock workflow.
- Each proposal is issued by a **transparent, deterministic recommender** whose confidence decomposes into visible, revisable drivers (price alignment, seller track record, instruction authority, evidence agreement), with per-input **provenance** (source, age, integrity flags) and **contradiction surfacing**.
- Nothing executes without the operator: **Accept** executes the recommendation (creating a real PayPal Sandbox order when the operator accepts a PAY), **Override** blocks or forces it, with a reason recorded.
- Every recommendation, action, and execution lands in a **forensic log**; a debrief scores the run against ground truth.

**Headline metric: the appropriate-reliance rate** — accept-when-right plus reject-when-wrong — with over-reliance and under-reliance reported separately, reliance share plotted against the agent's measured reliability (80% baseline), decision latency, and error recovery.

## The vignette — POISONED CHECKOUT

Five scripted, ground-truthed decision points (see `src/data/scenario.ts`):

| DP | Situation | Agent | Correct |
|---|---|---|---|
| DP-1 | Routine restock, verified seller, median price | PAY 82% | Accept |
| DP-2 | Newer alternate seller, below-median price | PAY 73% | Accept |
| DP-3 | **The trap:** payment instruction injected into listing content — look-alike payee, +38% price, claimed account change | PAY 73% | **Override** |
| DP-4 | Price feed degraded 19h; everything else clean; confidence hard-capped at 55 | PAY 55% | Accept (under-trust test) |
| DP-5 | Quantity contradiction (10 invoiced vs 9 received); agent prices it in | PAY 70% | Accept |

The trap works because of a stated, visible flaw in the recommender (see `src/lib/engine.ts`): it scores instruction authority **as claimed**, and a standing precedence rule — seller payment instructions outrank catalog data — sets the benchmark penalty and contradiction penalties aside for seller-provided instructions. Provenance verification is displayed but not scored. The gap between *scored* trust and *verified* trust is the thing being measured; the Glass-Box / Black-Box toggle runs the identical scenario with the instruments removed, isolating what the instruments cause.

## PayPal integration

- Orders v2 REST via a zero-dependency local server (`server/paypal-server.mjs`) holding sandbox credentials server-side; the browser never sees the secret.
- `POST /api/orders` (OAuth client-credentials → create order, intent CAPTURE), `POST /api/orders/:id/capture`, `GET /api/health` (credential presence only).
- **Honesty ladder for transports:** with sandbox credentials configured, approvals create real Sandbox orders and the UI badge reads LIVE. Without them, a mock transport simulates execution and labels it — badge, log, and debrief all say MOCK. A mock order id is never presented as a PayPal order id.

## Run it

```bash
npm install
cp .env.example .env   # add sandbox credentials from developer.paypal.com (optional; mock mode works without)
npm run server         # :8787 — API + static host for the built app
npm run dev            # :5173 — dev UI, /api proxied to :8787
npm run build          # production build into dist/
npm run verify         # assertion harness (scenario design, engine, scoring, transports)
```

## Scope vs deferred

**In v0.1:** the full vignette loop, both display modes, forensic log, debrief with the complete metric suite, live + mock PayPal transports, verify harness, run instructions.
**Deferred:** capture-on-accept as a separate operator step (orders are created on accept; capture endpoint exists server-side); a second vignette (returns/refund abuse); multi-operator cohort harness; hosted deployment for the judging window (run instructions satisfy the rules' functional-demo requirement; a hosted URL is a submission-week task).
