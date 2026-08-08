-- WhatsApp contacts for compliance click-to-send reminders. Mirrors the
-- existing wa.me deep-link pattern already used in debt.js/credit.js —
-- no SMS/WhatsApp provider exists anywhere in this codebase, so this is
-- a manual "open WhatsApp with the message pre-filled" button, not an
-- automated send. Recipient is chosen per-click: owner or team/accountant.
alter table public.businesses
  add column owner_whatsapp_number text,
  add column team_whatsapp_number text;
