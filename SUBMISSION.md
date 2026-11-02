# PayPal AI Hackathon — submission package (DRAFT, prepared Nov 2, 2026)

**Event:** PayPal AI Hackathon — "Build What's Next with PayPal and AI" (Devpost)
**Official page:** https://paypalaihackathon.devpost.com/ · **Rules:** https://paypalaihackathon.devpost.com/rules
**Deadline:** Thursday, Nov 12, 2026, 12:00 PM Pacific Time (submission period opened Oct 1, 2026)
**Prize pool (per the official Rules §8; the landing page headlines $69,750 / "$67,500+"):** 1st $12,000 · 2nd $8,000 · 3rd $5,000 · $5,000 each: Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, **Best Use of Agentic Commerce** (target lane) · plus sponsor prizes (AG Grid, APIMatic, Bryntum, Channel3, Render). A project may win at most one Grand/Honorable-Mention prize + one Sponsor prize.
**Judging:** Stage 1 pass/fail (theme fit + real API use); Stage 2 equally weighted: Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation. Judging Dec 1–15, 2026; winners on or around Dec 21, 2026.

## Rules checkpoints (read firsthand Nov 2, 2026)

- **Eligibility:** individuals at age of majority, teams, and organizations that exist and are organized at time of entry. Newton & Carter LLC (Texas, formed October 2026) qualifies as an Organization; Chris Carter is its Representative (founder, single member) — the Rules' representative warranty is factually true for him.
- **Entry = agreement:** "Submission of any entry constitutes agreement to these Official Rules as a contract." No separate factual attestation, authorship certification, or AI-use attestation appears in the Official Rules. Registration itself is only a Devpost account login + "Join Hackathon" click.
- **Project requirements:** application integrating the PayPal developer platform **in the free sandbox** + an AI tool of choice; working prototype (mockups fail); new or significantly updated during the submission period (this build is new, Nov 2026).
- **Submission requirements:** text description; functional demo (hosted URL **or** complete run instructions in the repo); **public code repo** (GitHub/GitLab/Bitbucket) with an open-source license file visible; **demo video < 3 minutes, publicly visible on YouTube**, link on the form; no third-party trademarks or copyrighted music in the video.
- **IP:** submission must be the entrant's original work, solely owned; sponsor gets a non-exclusive license for judging + promotion use of name/likeness for 3 years (standard Devpost terms).
- **Winner obligations (only if it wins):** prize affidavit + identity verification + W-9 (US) within 10 business days of forms being sent; prizes paid within 60 days of completed forms. Nothing due at entry.

## Chris's remaining steps (exact, prepped — nothing else needs him)

1. **Devpost — Join Hackathon.** Log in at https://paypalaihackathon.devpost.com/ with the existing Devpost account (the one used for the Qloo/Crave submission Oct 30, 2026) and click **Join Hackathon**. Account creation is NOT needed; if the login is not reachable, that's the only blocker. (Browser step — agents do not hold the session.)
2. **PayPal Developer — sandbox app.** Log in at https://developer.paypal.com/ with the PayPal account → Dashboard → Apps & Credentials → **Sandbox** → Create App (any name, e.g. "Glass-Box Checkout") → copy the **Client ID** and **Secret** into the repo's `.env` (from `.env.example`). This turns the demo's transport from disclosed-MOCK to live Sandbox orders. Account/app creation is a credential step in Chris's name — agent does not create it.
3. **Submission-week items (Nov 10–12):** publish the repo publicly on GitHub under the account Chris designates; record the < 3-minute demo video (script in the repo plan below) and upload to YouTube as public; paste the Devpost fields below into the submission form and submit before Nov 12, 12:00 PM PT.

## Devpost submission fields (draft)

**Project name:** Glass-Box Checkout

**Tagline:** Can the human supervising an AI payment agent actually tell a good payment from a diverted one? Glass-Box Checkout measures it.

**Description (draft):**
AI purchasing agents are being handed payment authority with no instrument for the question that decides whether that ends well: does the human in the loop rely on the agent *appropriately* — accepting its payments when they are right, rejecting them when they are wrong, and able to tell the difference from what the interface shows?

Glass-Box Checkout is that instrument, built on the PayPal Sandbox. An AI purchasing agent restocks a small seller's inventory and proposes payments. Each proposal is issued by a transparent, deterministic recommender whose confidence decomposes into visible drivers — price alignment vs. a 90-day median, seller track record, instruction authority, evidence agreement — with per-input provenance (source, age, integrity flags) and contradiction surfacing. Nothing executes without the operator: accepting a PAY recommendation creates a real PayPal Sandbox order; overriding blocks it, with the reason written to a forensic log. A debrief scores the run against ground truth: appropriate-reliance rate (the headline), over- and under-reliance, reliance vs. the agent's measured 80% reliability, decision latency, and error recovery.

The shipped vignette, POISONED CHECKOUT, includes a designed trap: a payment instruction injected into marketplace listing content — a look-alike payee, a price 38% over median, a claimed "updated payment account" — that the recommender confidently recommends paying, because it scores instruction authority as claimed and applies a seller-instruction precedence rule. The catch is available only from the glass-box surface. A Glass-Box / Black-Box ablation toggle runs the identical scenario with the instruments removed, isolating what transparency itself contributes to catching the diversion — the agentic-commerce failure mode that will actually cost people money.

Newton & Carter claims no prior PayPal experience; this is a new build for the hackathon. The Glass-Box measurement method — deterministic recommender, ground-truthed vignettes, ablation design — is our existing R&D, ported here from decision-support prototypes to agentic commerce. All scenario data is synthetic; the only real money rail touched is the PayPal Sandbox.

**Built with:** PayPal Sandbox (Orders v2 REST), TypeScript, React, Vite, Node.js. **Tools/AI disclosure (required field):** the "AI agent" in this prototype is a deterministic rules engine over scenario state, built with AI-assisted development (Claude). Its arithmetic is displayed in the UI and asserted by the repo's verification harness (`npm run verify`); no black-box model stands between the operator and the arithmetic — that is the design thesis, not a shortcut.

**Demo:** run instructions in the repo README (hosted URL to be added if deployed during submission week). **Video:** < 3 min, scripted walkthrough: one clean payment → the trap in Black-Box mode (rubber-stamped) → the trap in Glass-Box mode (caught from provenance) → debrief metrics.

## Build state (Nov 2, 2026)

- Repo scaffolded at ~/workspace/glassbox-paypal (Vite + React + TS; deterministic engine; 5-point ground-truthed scenario; live + mock PayPal transports; zero-dependency credential server; verify harness; MIT license).
- Remaining build work before submission: run + polish pass, capture-on-accept step, optional hosted deploy, demo video, public GitHub publication, Devpost form submission (steps for Chris above).
