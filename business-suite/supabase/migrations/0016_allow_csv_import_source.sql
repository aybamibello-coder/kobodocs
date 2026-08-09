-- Allow 'csv_import' as a valid receivables.source value, alongside the
-- existing 'manual' and 'invoice', so bulk-imported receivables (from
-- the shared /assets/kobo-import.js tool) are distinguishable from
-- manually-entered ones for future analytics/audit purposes.
ALTER TABLE receivables DROP CONSTRAINT receivables_source_check;
ALTER TABLE receivables ADD CONSTRAINT receivables_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'invoice'::text, 'csv_import'::text]));
