# KoboDocs

Free invoice, receipt, quotation, and payslip generator for Nigerian businesses — plus budget planning, loan schedules, and an Ajo/Esusu contribution tracker. No login required.

## Live status

| Page | Status |
|---|---|
| `/` — Homepage | Built |
| `/invoice/` | Fully functional — form, live preview, PDF export, WhatsApp share |
| `/receipt/` | Fully functional |
| `/quotation/` | Fully functional |
| `/payslip/` | Fully functional — 2026 Nigeria Tax Act PAYE bands, pension (8%), NHF (2.5%), rent relief |
| `/budget/` | Fully functional — income/expense rows, balance calc |
| `/loan/` | Fully functional — reducing-balance amortization schedule |
| `/ajo/` | Fully functional — rotation order, paid/pending status, PDF + WhatsApp export (session-only, not yet persistent) |
| `/pricing/` | Built (billing not wired up) |
| `/business-suite/app/credit/` | Built — Growth tier only (aging, ledger, promise-to-pay, collection notes, statement PDF, audit log) |
| Pro accounts (Supabase auth) | Not started |
| Paystack billing | **Live.** `init-suite-payment` (Starter) and `init-suite-growth-payment` (Growth) both call Paystack's initialize API; `paystack-webhook` verifies the signature and updates `businesses` on `charge.success` (Growth also flips `suite_tier`). |
| Deployment | Not yet connected to Cloudflare Pages — pending domain purchase |
| `/forms/` — KoboDocs Form | **Live.** Builder (12 field types incl. file upload and signature capture), conditional field visibility (show-if rules), AI form generator (Pro+, `generate-schema` edge function), publish/close, public fill page, responses table + CSV export. Plan limits enforced (forms count via DB trigger); submission-count caps tracked but not yet hard-enforced. **No payment integration** — KoboDocs never collects or holds money through a form. Not yet built: self-serve plan upgrades (manual only, via `/admin/forms-survey-plans/`), WhatsApp auto-notify (declined by design — see below). |
| `/survey/` — KoboDocs Survey | **Live.** Builder (9 question types: text, paragraph, multiple choice, checkboxes, rating, NPS, Likert, ranking, matrix/grid), skip logic (same show-if mechanism as Forms), AI survey generator (Pro+), cross-tab analytics between two single-answer questions, multilingual starter templates (English/Pidgin in full; Hausa/Yoruba/Igbo titles only, flagged for native-speaker review), publish/close, public fill page, responses table + CSV export. Same plan-limit pattern as Forms. Not yet built: self-serve plan upgrades. |

## Structure

```
/                    -> homepage
/invoice/            -> index.html + invoice.js
/receipt/            -> index.html + receipt.js
/quotation/          -> index.html + quotation.js
/payslip/            -> index.html + payslip.js
/budget/             -> index.html + budget.js
/loan/               -> index.html + loan.js
/ajo/                -> index.html + ajo.js
/pricing/            -> pricing page
/assets/style.css    -> shared design system (all pages)
/assets/app.js       -> shared behavior: nav toggle, scroll reveals, stat counters
```

Every generator follows the same shape: form -> live preview -> PDF export (jsPDF, CDN) -> WhatsApp share (wa.me link). All free-tier tools are session-only by design — nothing persists after the tab closes unless downloaded or shared.

## Payslip tax logic

Uses the Nigeria Tax Act 2025 bands (effective 1 Jan 2026), cross-checked against Africa Check, iTax.ng, and NGN Market:

- 0% on the first ₦800,000 (annual)
- 15% / 18% / 21% / 23% / 25% progressive bands above that, up to 25% above ₦50m
- Pension: 8% of (Basic + Housing + Transport)
- NHF: 2.5% of Basic
- Rent relief: 20% of annual rent paid, capped at ₦500,000 (replaces the old CRA)

Flagged in-app as estimates — tax rules and individual circumstances vary, so this isn't a substitute for an accountant.

## Ajo/Esusu tracker

The key differentiator from the market research: existing "ajo/esusu" competitors are all custodial fintech apps that hold members' money. This tool is deliberately **non-custodial** — it only tracks rotation order and payment status. Contributions still happen directly between members. Currently session-only; persistent, shareable circle links are a planned Pro feature (needs Supabase).

## KoboDocs Form & KoboDocs Survey

Two new standalone products, each with its own Supabase schema, plan-limits table, and subscriptions table (`forms`/`form_responses`/`form_plan_limits`/`form_subscriptions` and the `survey_*` equivalents) — following the same per-product pattern as `transcription_*` and `payroll_*`, not the older shared `profiles.plan` gate.

- **No payment integration in either product, or anywhere else in KoboDocs.** KoboDocs does not hold money on a form-filler's or survey-respondent's behalf. If a form owner needs to collect payment, they add their own external payment link as a text/URL field — KoboDocs itself never touches the money. Plan upgrades are currently a manual/admin process (no self-serve checkout yet).
- Public fill pages (`/forms/f/?s=<slug>`, `/survey/s/?s=<slug>`) work with no login, via `get_public_form`/`submit_form_response` and `get_public_survey`/`submit_survey_response` — SECURITY DEFINER RPCs that mirror the existing RSVP/quote-proposal pattern rather than edge functions.
- Form field types: text, paragraph, number, email, phone, date, dropdown, multiple choice, checkboxes, rating, file upload (uploads go to the private `form-uploads` storage bucket, keyed `{form_id}/{random}-{filename}`, readable only by the form's owner), and signature (canvas capture, same reuse of the storage bucket as a PNG).
- Survey question types: text, paragraph, multiple choice, checkboxes, rating, NPS, Likert, ranking.
- Conditional visibility: every field/question past the first can have a `showIf: { fieldId, op, value }` rule (`equals`/`not_equals`/`answered`/`not_answered`) stored directly in the `fields`/`questions` jsonb — no schema change needed. The public fill pages evaluate it live and exclude hidden items from both validation and the submitted payload.
- AI generator: `generate-schema` edge function (Gemini primary, Groq fallback — same provider pattern as `compliance-assistant`) turns a plain-English description into a draft set of fields/questions. Gated server-side to Pro-and-up plans (checked against `form_subscriptions`/`survey_subscriptions`, not just hidden in the UI), and never asked to generate a payment field.
- Multilingual survey templates (`survey/app/survey-templates.js`): English and Nigerian Pidgin are hand-written in full (customer satisfaction, employee engagement, event feedback). Hausa/Yoruba/Igbo currently translate the title only — the questions stay in English with an on-screen review note, rather than ship unverified translations of survey wording.
- Plan limits (`max_forms`/`max_surveys`) are enforced at creation time by a `BEFORE INSERT` trigger; response/submission caps are tracked (`response_count`) but not yet hard-blocking — soft-cap only, no WhatsApp nudge (declined — no WhatsApp auto-notify in this product).
- Plan assignment is manual — `/admin/forms-survey-plans/` (admin-gated by `is_kobodocs_admin`) looks up a user by email and sets their Form/Survey plan and optional expiry via `admin_set_form_plan`/`admin_set_survey_plan`. No self-serve checkout exists for either product.
- Survey question types now include `matrix` (rows × columns grid, single choice per row) alongside the original 8. Cross-tab analytics (Analytics tab) cross-tabulates two single-answer questions (multiple choice, rating, NPS, Likert) client-side from the loaded responses — no new schema, just a client-side pivot.
- Deliberately not integrated: the full `/esign/` multi-signer envelope workflow. The Form `signature` field is a single inline capture tied to one form submission — a different, narrower thing than sequential multi-party signing — and folding the two together risked a half-built version of an already-shipped product. If a form owner needs proper multi-signer e-signature, they use `/esign/` directly.
- Not yet built: self-serve plan upgrades (still admin-only via `/admin/forms-survey-plans/`, since neither product has payment integration).

## Business Suite tiers

Business Suite now has two tiers, gated by `businesses.suite_tier`:

- **Starter** (₦15,000/mo) — invoicing, quotes, basic debt dashboard, bookkeeping, inventory. Unchanged from before.
- **Growth** (₦28,000/mo) — everything in Starter, plus `/business-suite/app/credit/`: full debt aging, a per-customer ledger with downloadable statements, promise-to-pay tracking, collection notes, and an audit log. Also adds a **Quotation & Proposal Studio** on top of the existing `/business-suite/app/quotes/` pages: reusable templates, proposal sections, a public client approval link (`/proposal/?t=...`, accept/decline, no login), version history, and analytics (view rate, acceptance rate, accepted value).

Both migrations (`0001_credit_collections.sql`, `0002_quotation_proposal_studio.sql`) are **applied** to the live project (`vwmzulzluaxedkozxjfy`). `0001` added `suite_tier` to `businesses` and the credit/collections tables. `0002` added `quote_templates`, `quote_versions`, `quote_share_links`, `quote_audit_log`, plus two SECURITY DEFINER RPCs (`get_quote_proposal_data`, `respond_to_quote_proposal`) that let the public `/proposal/` page work without a login — it also fixed `documents.quote_status` to allow `'declined'`. The Starter tier's existing tables and pages are untouched.

`business-suite/supabase/functions/` has the source for the two edge functions touched for Growth billing: `init-suite-growth-payment` (new, deployed as-is) and `paystack-webhook` (existing, shared across the whole site — **the copy in this repo is deliberately abbreviated to just the Business Suite branches; do not deploy it as-is, it would wipe every other product's webhook handling**. Use `list_edge_functions`/`get_edge_function` via the Supabase MCP tools to pull the real full source before editing it again).

Note: quote editing isn't built yet (only creation), so version history currently only ever holds one snapshot per quote — it's there so editing can be added later without a schema change.

## Stack

- Static HTML/CSS/JS, no build step — deploys directly to Cloudflare Pages
- jsPDF (CDN) for PDF export
- Supabase (planned, free tier) — Pro account auth + saved/persistent data
- Paystack (planned) — subscription billing

## Next steps

1. Register kobodocs.com.ng, connect this repo to Cloudflare Pages
2. Wire up Supabase auth + Paystack for Pro/Business tiers
3. Add persistent, shareable Ajo/Esusu circle links (Pro feature)
4. Add saved clients/employees and document history (Pro feature)
