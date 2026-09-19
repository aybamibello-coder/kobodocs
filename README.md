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
| `/forms/` — KoboDocs Form | **Live.** Builder (16 field types incl. URL, time, linear scale, emoji rating, file upload, signature), conditional field visibility (show-if rules), AI form generator (Pro+, `generate-schema` edge function), Settings tab (response limit, closing date/time, one-response-per-device, human-check, custom confirmation heading/message, post-submit redirect), Share tab (QR code, embed iframe code, WhatsApp link), Duplicate, publish/close, public fill page (with honeypot anti-bot + settings enforcement), responses table + stats (total/today/7-day) + CSV/JSON export. Plan limits enforced (forms count via DB trigger, response limit enforced both client- and server-side). Self-serve Squad checkout (see below — policy reversed Sept 2026). Not yet built: WhatsApp auto-notify (declined by design — see below). |
| `/survey/` — KoboDocs Survey | **Live.** Builder (10 question types incl. Yes/No, matrix/grid), skip logic (same show-if mechanism as Forms), AI survey generator (Pro+), cross-tab analytics, multilingual starter templates (English/Pidgin in full; Hausa/Yoruba/Igbo titles only, flagged for native-speaker review), same Settings/Share/Duplicate/stats/export additions as Forms (response limit, closing date, one-per-device, human-check, custom confirmation, redirect, QR/embed, JSON export), publish/close, public fill page. Same plan-limit pattern as Forms. Not yet built: self-serve plan upgrades. |
| `/booking/` — KoboDocs Booking | **Live (v1).** Booking page per business with multiple services (event types), default working hours + optional per-staff calendars (Growth+), no-double-booking enforced server-side (`create_booking` RPC, overlap check via `tstzrange`), access-code gating (same withhold-until-unlocked pattern as Forms/Survey), QR/embed/WhatsApp share, bookings table with search + CSV export, cancel-by-link (no login) for customers. Availability is computed client-side from working hours + existing bookings — no Google Calendar sync yet (would need a one-time OAuth setup, flagged as a Phase 2 add-on). No paid APIs used: email via existing Resend setup, WhatsApp via plain `wa.me` links, no calendar API dependency in v1. |

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

- **Payment policy reversed Sept 2026**: earlier in this build, KoboDocs Form/Survey deliberately had zero payment integration, on Ayo's explicit instruction ("do not integrate payment whatsoever ... KoboDocs doesn't hold business money"). That instruction was later reversed (also explicit, also Ayo's call) and self-serve Squad checkout was added for both products — `init-form-payment`/`init-survey-payment` edge functions, `squad-webhook` gained `kobodocs_form`/`kobodocs_survey` branches that upsert `form_subscriptions`/`survey_subscriptions` on successful payment, and the pricing-card buttons on `/forms/` and `/survey/` now trigger `window.KoboSubscribe.startSafely(...)` instead of linking straight into the app. Admin manual plan assignment (`/admin/forms-survey-plans/`) still exists as a fallback/override path, not the primary flow anymore. If anyone revisits this later: the no-payment rule was real and intentional at the time, then just as intentionally undone — don't assume either state is a mistake without checking with Ayo first.
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
- Self-serve plan upgrades: live via Squad checkout (see "Payment policy reversed" above) — superseded the admin-only-only assignment flow as primary, though `/admin/forms-survey-plans/` still works as a manual override.

### September 2026 feature-parity pass (against a Jotform/Typeform/SurveyMonkey-style feature spec; payments were excluded by design at the time this pass was written — see "Payment policy reversed" above for the later reversal)
- Form field types added: URL, time, linear scale (1–10), emoji rating (5-point). Survey question types added: Yes/No.
- Settings tab (both products), all stored in the existing `settings` jsonb — no new columns: max responses, closing date/time, one-response-per-device (localStorage-based, not a server-verified identity), a lightweight arithmetic human-check (opt-in, no external CAPTCHA service), custom confirmation heading/message, and a post-submit redirect URL. Enforced both client-side (friendly pre-fill message) and server-side (`submit_form_response`/`submit_survey_response` now take a 3rd `p_honeypot` arg and check `closesAt`/`responseLimit` from `settings`; old 2-arg overloads dropped).
- Anti-bot: an always-on hidden honeypot field (invisible to real visitors, silently accepted-but-discarded if filled) plus the optional human-check above. No third-party CAPTCHA service integrated.
- Share tab: QR code (via `qrcodejs` from cdnjs, generated client-side, downloadable as PNG) and an embed `<iframe>` snippet, alongside the existing copy-link/WhatsApp-share.
- Dashboard: Duplicate button (copies fields/questions/settings, resets to draft with a fresh slug).
- Responses tab: mini stats row (total / today / last 7 days) plus CSV and now JSON export.
- Deliberately not built from the fuller spec this pass: **quiz/exam mode** (confirmed skipped for now — no product-overlap reason, just not needed yet); **team roles/collaboration, version history, webhooks/public API, CRM/Zapier/Make integrations, custom domains** (all substantial, multi-day builds better scoped as their own future work than squeezed into a feature-parity pass); **piping/randomization/quotas/geographic targeting** (research-survey-tool depth beyond what a first pass needs — candidates for a later round if Ayo wants deeper SurveyMonkey-style research tooling); **real per-response-per-email uniqueness** (would require collecting email, which cuts against the anonymous-by-default posture — the one-per-device localStorage check is the privacy-preserving stand-in).

### Follow-up round: email notifications + response search/detail
- Email type added to Survey (Forms already had it) — needed so the confirmation-email feature has something to detect.
- New `send-form-notification` edge function (verify_jwt off, service-role lookups, same Resend infra as `send-welcome-email`): sends the form/survey owner an email on every new response (default on, toggle in Settings) and, if the owner opts in and the response includes an email field/question, a confirmation email to the respondent reusing the same confirmation heading/message text. Both are fire-and-forget from the public fill pages — a failed or unconfigured email never blocks or delays the submission.
- Responses tab (both products): a search box that filters the table client-side across all answer values, and clicking a row opens a detail panel with every field/question and its full answer (useful for long text answers the table truncates).
- Bug fixes found and fixed while doing this pass: Survey's Yes/No question type had no branch in the response-submission code, so submitting a required Yes/No question would have thrown — fixed. File/signature answers in the Forms responses table were rendering as broken links (the raw private-bucket storage path was used directly as an `href`) — now resolved to a real signed URL on click instead.
- **Cross-product bug found via real testing (Sept 2026)**: file/signature uploads on a public Form failed with `permission denied for function is_business_owner`. Root cause was outside Forms entirely — several `compliance-documents` storage policies on the shared `storage.objects` table (`compliance_documents_owner_*`, `compliance_documents_member_read`) had no role restriction (applied to `public`, i.e. every role including `anon`), so an anonymous respondent's upload to `form-uploads` still triggered Postgres to evaluate those unrelated policies, which call `is_business_owner()`/`is_business_member()` — functions `anon` was never granted EXECUTE on. Fixed by scoping those policies to `authenticated` (their actual intended audience) and granting EXECUTE on both functions to `anon` as defense-in-depth. Worth knowing for anyone adding a new storage policy anywhere in the suite: always add `to authenticated` (or the specific intended role) explicitly, or it silently applies to anonymous traffic on every bucket, not just yours.

### Four core gaps closed: sections/pagination, branding, access codes, bulk response management
- **Sections / multi-page**: a `section` pseudo-type in the same `fields`/`questions` array (no schema change) acts as a page break — everything after it, up to the next one, is a new page. The public fill pages render every page in the DOM up front (toggling `display` rather than re-rendering per page), specifically so file inputs and signature canvases don't lose their captured value when the visitor goes Back. Per-page validation runs before advancing; conditional/skip logic still works across page boundaries since the DOM for earlier pages stays live.
- **Branding**: Settings tab now has a Branding section (logo upload, accent color) per form/survey. Reuses the existing public `brand-logos` storage bucket (already used by another KoboDocs product, path-scoped to `{user_id}/...`) rather than creating a new one. Applied on the public fill page by overriding the `--ink-green-deep` CSS variable and swapping the wordmark for the uploaded logo. The "Powered by KoboDocs" footer only shows once a logo is set, matching the Free-plan-branding intent from the original pricing plan.
- **Access codes (password protection)**: security-sensitive, so it's not just a client-side check. `get_public_form`/`get_public_survey` strip `accessCode` from the settings they return and, when a code is set, withhold `fields`/`questions` entirely — a locked form leaks nothing but its title until unlocked. New `unlock_form`/`unlock_survey` RPCs take the slug + submitted code and only return the full payload on a match. The old 2-arg shape is preserved for unlocked forms/surveys; only the locked path changes.
- **Bulk response management**: Responses tab (both products) now has per-row checkboxes + select-all + "Delete selected", and every column header is click-to-sort (ascending/descending, toggles on repeat click). All client-side against the already-loaded response set — no new RPCs needed, since the existing owner-scoped RLS delete policy already covered bulk deletes.

## KoboDocs Booking

Third product in the same family as Forms/Survey — same per-product schema pattern (`booking_pages`/`booking_event_types`/`booking_staff`/`bookings`, own `booking_plan_limits`/`booking_subscriptions`), same public-RPC access model, same builder-shell UI conventions.

- **Pricing**: Free (1 service, 15 bookings/mo), Starter ₦6,000/mo, Growth ₦13,000/mo (up to 3 staff calendars), Team ₦25,000/mo (unlimited staff). No per-seat charges — deliberately, in contrast to Calendly's per-user pricing.
- **No paid APIs**: reminders/confirmations go through the existing Resend setup (already used by Forms/Survey/e-Signature); WhatsApp sharing is a plain `wa.me` link, not the paid WhatsApp Business API; there's no Google Calendar dependency in v1 — availability lives entirely in KoboDocs' own database. Calendar sync is a clearly-scoped Phase 2 item that would need a one-time (free) Google Cloud OAuth setup, not an ongoing cost.
- **Availability model**: each booking page has default working hours (`settings.workingHours`, a 7-day grid) used by any service with no assigned staff member. From Growth up, a business can add named staff, each with their own hours (`booking_staff.working_hours`) and blackout dates; a service can be assigned to a specific staff member via `booking_event_types.staff_id`.
- **No double-booking**: enforced server-side in `create_booking()` via a `tstzrange` overlap check against existing confirmed bookings for that staff member (or the page as a whole, when no staff is assigned), including each service's buffer-before/buffer-after minutes. The public page also computes and displays only genuinely open slots client-side (via `get_booking_availability`), so customers rarely even see a slot that then turns out to be taken — but the server check is what actually prevents the race condition.
- **No payment collection**: `price_display` on a service is purely informational text (e.g. "₦5,000") — KoboDocs never charges or holds money through a booking, consistent with keeping this a low-risk, low-friction product to try.
- **Customer confirmation emails are core UX, not opt-in** (unlike Forms/Survey's `sendConfirmationEmail` toggle) — every customer who leaves an email gets one, the same way any real scheduling tool works. `send-form-notification` was extended (not duplicated) to support `product: 'booking'` alongside `form`/`survey`.
- **Cancellation**: each booking gets a `cancel_token` (uuid); the confirmation email/screen includes a `/booking/cancel/?t=<token>` link that works with no login, via the `cancel_booking` RPC.
- Not yet built: Google Calendar sync (Phase 2, see above), recurring/multi-session bookings, SMS reminders, a customer-facing "manage my upcoming bookings" page (currently just the one-off cancel link).

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
