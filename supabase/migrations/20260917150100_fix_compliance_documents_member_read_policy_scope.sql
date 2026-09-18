-- Same class of bug as the compliance_documents_owner_* policies fixed
-- in the prior migration: compliance_documents_member_read also had no
-- role restriction and calls is_business_member(), which anon lacks
-- EXECUTE on. Scope to authenticated (compliance documents are never a
-- public/anon-accessible feature) and grant EXECUTE as defense-in-depth.

alter policy "compliance_documents_member_read" on storage.objects to authenticated;

grant execute on function public.is_business_member(uuid) to anon;
