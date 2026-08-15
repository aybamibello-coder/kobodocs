// PDF OS — Document Vault. Uses the shared Supabase client directly
// (window.KoboAuth.supabase) for storage upload + the pdf_os_vault_files
// table. Quota (doc count) and retention (expires_at) are enforced
// server-side via RLS WITH CHECK and a BEFORE INSERT trigger — this
// module doesn't need to (and shouldn't) re-implement those checks, it
// just surfaces whatever error Postgres returns.
window.PdfOsVault = {

  // file: { name, size, arrayBuffer } (or a Blob) — same shape as
  // fileStore entries elsewhere in PDF OS.
  save: function (file) {
    return window.PdfOsGuard.checkAccess().then(function (access) {
      if (!access.session) return Promise.reject({ code: 'AUTH_REQUIRED' });

      var supabase = access.supabase;
      var userId = access.session.user.id;
      var vaultId = crypto.randomUUID();
      var storagePath = userId + '/' + vaultId + '-' + file.name;
      var body = file.blob || new Blob([file.arrayBuffer], { type: 'application/pdf' });

      return supabase.storage.from('pdf-os-vault').upload(storagePath, body, {
        contentType: 'application/pdf',
        upsert: false
      }).then(function (uploadResult) {
        if (uploadResult.error) return Promise.reject({ code: 'UPLOAD_FAILED', detail: uploadResult.error.message });

        return supabase.from('pdf_os_vault_files').insert({
          id: vaultId,
          user_id: userId,
          file_name: file.name,
          storage_path: storagePath,
          size_bytes: body.size,
          mime_type: 'application/pdf'
        }).select().single().then(function (insertResult) {
          if (insertResult.error) {
            // Table insert failed (e.g. over the plan's document limit) —
            // clean up the orphaned storage object rather than leave it
            // billed-for-nothing.
            return supabase.storage.from('pdf-os-vault').remove([storagePath]).then(function () {
              var isQuota = /vault_within_limit|new row violates row-level security/.test(insertResult.error.message || '');
              return Promise.reject({ code: isQuota ? 'VAULT_LIMIT_REACHED' : 'SAVE_FAILED', detail: insertResult.error.message });
            });
          }
          return insertResult.data;
        });
      });
    });
  },

  list: function () {
    return window.PdfOsGuard.checkAccess().then(function (access) {
      if (!access.session) return Promise.reject({ code: 'AUTH_REQUIRED' });
      return access.supabase
        .from('pdf_os_vault_files')
        .select('id, file_name, size_bytes, created_at, expires_at')
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) return Promise.reject({ code: 'LIST_FAILED', detail: res.error.message });
          return res.data;
        });
    });
  },

  // Returns a short-lived signed URL — the bucket is private, so files
  // aren't reachable by a plain public URL.
  getDownloadUrl: function (vaultFileId) {
    return window.PdfOsGuard.checkAccess().then(function (access) {
      var supabase = access.supabase;
      return supabase.from('pdf_os_vault_files').select('storage_path').eq('id', vaultFileId).single()
        .then(function (row) {
          if (row.error) return Promise.reject({ code: 'NOT_FOUND' });
          return supabase.storage.from('pdf-os-vault').createSignedUrl(row.data.storage_path, 300); // 5 min
        }).then(function (signed) {
          if (signed.error) return Promise.reject({ code: 'SIGN_FAILED', detail: signed.error.message });
          return signed.data.signedUrl;
        });
    });
  },

  remove: function (vaultFileId) {
    return window.PdfOsGuard.checkAccess().then(function (access) {
      var supabase = access.supabase;
      return supabase.from('pdf_os_vault_files').select('storage_path').eq('id', vaultFileId).single()
        .then(function (row) {
          if (row.error) return Promise.reject({ code: 'NOT_FOUND' });
          return supabase.storage.from('pdf-os-vault').remove([row.data.storage_path]).then(function () {
            return supabase.from('pdf_os_vault_files').delete().eq('id', vaultFileId);
          });
        });
    });
  }
};
