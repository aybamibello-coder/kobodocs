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
| Paystack billing | Not started (Growth tier upgrade button calls `init-suite-growth-payment`, not yet deployed) |
| Deployment | Not yet connected to Cloudflare Pages — pending domain purchase |

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

## Business Suite tiers

Business Suite now has two tiers, gated by `businesses.suite_tier`:

- **Starter** (₦15,000/mo) — invoicing, quotes, basic debt dashboard, bookkeeping, inventory. Unchanged from before.
- **Growth** (₦28,000/mo) — everything in Starter, plus `/business-suite/app/credit/`: full debt aging, a per-customer ledger with downloadable statements, promise-to-pay tracking, collection notes, and an audit log. Also adds a **Quotation & Proposal Studio** on top of the existing `/business-suite/app/quotes/` pages: reusable templates, proposal sections, a public client approval link (`/proposal/?t=...`, accept/decline, no login), version history, and analytics (view rate, acceptance rate, accepted value).

Run `business-suite/supabase/migrations/0001_credit_collections.sql` and `0002_quotation_proposal_studio.sql` (in order) against the live project (`vwmzulzluaxedkozxjfy`) before the Growth tier will work. `0001` adds `suite_tier` to `businesses` and the credit/collections tables. `0002` adds `quote_templates`, `quote_versions`, `quote_share_links`, `quote_audit_log`, plus two SECURITY DEFINER RPCs (`get_quote_proposal_data`, `respond_to_quote_proposal`) that let the public `/proposal/` page work without a login. The Starter tier's existing tables and pages are untouched either way.

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
