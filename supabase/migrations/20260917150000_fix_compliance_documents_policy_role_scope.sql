-- Bug fix: the compliance-documents storage policies had no role
-- restriction (applied to `public`, i.e. every role including anon).
-- Postgres evaluates every applicable RLS policy on storage.objects for
-- any insert/select/update/delete, regardless of which bucket the
-- operation targets. Because these policies call is_business_owner(),
-- and `anon` was never granted EXECUTE on that function (it's an
-- authenticated-business-owner-only feature), any anonymous upload to
-- ANY bucket -- including KoboDocs Form's public form-uploads bucket --
-- could trip this policy's evaluation and fail with
-- "permission denied for function is_business_owner", even though the
-- policy's bucket_id condition would otherwise exclude it.
--
-- Fix: scope these policies to `authenticated` only, which is what they
-- were always meant to do (compliance documents are a signed-in
-- business-owner feature, not public). Also grant EXECUTE on
-- is_business_owner to anon as defense-in-depth, in case another
-- unrestricted policy referencing it is added later.

alter policy "compliance_documents_owner_read" on storage.objects to authenticated;
alter policy "compliance_documents_owner_write" on storage.objects to authenticated;
alter policy "compliance_documents_owner_update" on storage.objects to authenticated;
alter policy "compliance_documents_owner_delete" on storage.objects to authenticated;

grant execute on function public.is_business_owner(uuid) to anon;
