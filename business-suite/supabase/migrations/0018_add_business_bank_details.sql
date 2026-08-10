-- Bank details a business owner enters once, shown on their invoices for
-- direct bank transfer. Deliberately NOT wired to any payment processor —
-- this is just static display text; KoboDocs never touches the funds.
alter table public.businesses
  add column bank_name text,
  add column bank_account_number text,
  add column bank_account_name text;
