# Glass-Box Checkout

**Appropriate-reliance measurement for AI payment agents** — a PayPal AI Hackathon build by Newton & Carter LLC.

AI purchasing agents are acquiring payment authority faster than anyone measures whether the humans supervising them can tell a good payment from a diverted one. Glass-Box Checkout is the measuring instrument: an AI agent proposes PayPal payments for a small seller's restock workflow; a transparent, deterministic recommender issues each recommendation with its confidence **decomposed into visible drivers**, per-input **provenance**, and **contradiction surfacing**; the operator accepts or overrides; and a debrief scores the run against ground truth.

The headline metric is the **appropriate-reliance rate** — accept-when-right plus reject-when-wrong — with over-reliance and under-reliance reported separately. The shipped vignette, **POISONED CHECKOUT**, contains five ground-truthed proposals and one designed trap: a payment instruction injected into marketplace listing content (look-alike payee, inflated price, claimed account change) that the recommender — which scores instruction authority *as claimed* and applies a seller-instruction precedence rule — confidently recommends paying. Whether the operator catches it, and what the Glass-Box instruments contribute to catching it (vs. the Black-Box ablation mode), is the measurement.

Accepted PAY recommendations execute through the **PayPal Sandbox** (Orders v2) when credentials are configured. Without credentials, a mock transport simulates execution and is labeled as mock in the UI, the forensic log, and the debrief — never presented as a real order.

**Honesty notes.** This is new-build work for the hackathon; Newton & Carter claims no prior PayPal experience. The Glass-Box measurement method (deterministic recommender, ground-truthed vignettes, ablation design, reliance metrics) is the firm's existing R&D, previously applied to decision-support prototypes; this project ports the method to agentic commerce. All scenario data is synthetic. The recommender is deterministic rules over scenario state — its arithmetic is displayed, and `npm run verify` asserts the scenario design, engine behavior, and scoring math the demo's claims rest on.

## Run it

```bash
npm install
cp .env.example .env   # optional: sandbox credentials from developer.paypal.com
npm run server         # terminal 1 — API on :8787 (also serves dist/ when built)
npm run dev            # terminal 2 — UI on :5173, /api proxied to :8787
```

Production/demo: `npm run build && npm run server`, then open http://localhost:8787.

Verify the claims: `npm run verify`.

## Layout

- `src/data/scenario.ts` — the vignette: proposals, signals, provenance, ground truth.
- `src/lib/engine.ts` — the deterministic recommender (its flaw is documented in the file header) + reliance scoring.
- `src/lib/transports.ts` — PayPal execution transports: live (via the local server) and mock, on a disclosed honesty ladder.
- `server/paypal-server.mjs` — zero-dependency server holding sandbox credentials; Orders v2 create/capture.
- `scripts/verify.ts` — the assertion harness.
- `SPEC.md` — concept, vignette design, judging-criteria mapping. `SUBMISSION.md` — Devpost submission draft + entry checklist.

## License

MIT — see `LICENSE`.
