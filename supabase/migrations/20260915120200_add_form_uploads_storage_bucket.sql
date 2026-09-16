-- File-upload field type for KoboDocs Form. Path convention:
-- {form_id}/{random}-{filename}. Anyone can upload to a published form
-- (this is a public form-fill action); only the form owner can read or
-- delete what was uploaded.

insert into storage.buckets (id, name, public, file_size_limit)
values ('form-uploads', 'form-uploads', false, 10485760) -- 10MB cap per file
on conflict (id) do nothing;

create policy "Anyone can upload to a published form"
  on storage.objects for insert
  with check (
    bucket_id = 'form-uploads'
    and exists (
      select 1 from forms
      where forms.id = (storage.foldername(name))[1]::uuid
        and forms.status = 'published'
    )
  );

create policy "Form owners can view their form uploads"
  on storage.objects for select
  using (
    bucket_id = 'form-uploads'
    and exists (
      select 1 from forms
      where forms.id = (storage.foldername(name))[1]::uuid
        and forms.owner_id = auth.uid()
    )
  );

create policy "Form owners can delete their form uploads"
  on storage.objects for delete
  using (
    bucket_id = 'form-uploads'
    and exists (
      select 1 from forms
      where forms.id = (storage.foldername(name))[1]::uuid
        and forms.owner_id = auth.uid()
    )
  );
