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
| Pro accounts (Supabase auth) | Not started |
| Paystack billing | Not started |
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
