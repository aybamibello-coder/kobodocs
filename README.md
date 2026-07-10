# KoboDocs

Free invoice, receipt, quotation, and payslip generator for Nigerian businesses — plus budget planning, loan schedules, and an Ajo/Esusu contribution tracker. No login required.

## Live status

| Page | Status |
|---|---|
| `/` — Homepage | Built |
| `/invoice/` — Invoice generator | Fully functional (form, live preview, PDF export, WhatsApp share) |
| `/receipt/` | Placeholder |
| `/quotation/` | Placeholder |
| `/payslip/` | Placeholder |
| `/budget/` | Placeholder |
| `/loan/` | Placeholder |
| `/ajo/` | Placeholder |
| `/pricing/` | Built (billing not wired up) |
| Pro accounts (Supabase auth) | Not started |
| Paystack billing | Not started |
| Deployment | Not yet connected to Cloudflare Pages — pending domain purchase |

## Structure

```
/                    -> homepage
/invoice/            -> invoice generator (index.html + invoice.js)
/receipt/            -> placeholder
/quotation/          -> placeholder
/payslip/            -> placeholder
/budget/             -> placeholder
/loan/               -> placeholder
/ajo/                -> placeholder
/pricing/            -> pricing page
/assets/style.css    -> shared design system (all pages)
/assets/app.js       -> shared behavior: nav toggle, scroll reveals, stat counters
```

Each generator page follows the same shape: form -> live preview -> PDF export (jsPDF) -> WhatsApp share (wa.me link). Receipt, quotation, and payslip should follow the `/invoice/` pattern directly -- same structure, different fields and calculations.

## Stack

- Static HTML/CSS/JS, no build step -- deploys directly to Cloudflare Pages
- jsPDF (CDN) for PDF export
- Supabase (planned, free tier) -- Pro account auth + saved data
- Paystack (planned) -- subscription billing

## Next steps

1. Register kobodocs.com.ng, connect to Cloudflare Pages
2. Build receipt, quotation, and payslip generators (copy `/invoice/` pattern)
3. Build the Ajo/Esusu tracker (rotation order + shareable ledger -- the product's key differentiator)
4. Wire up Supabase auth + Paystack for Pro/Business tiers
