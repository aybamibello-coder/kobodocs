function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function fmtMinutes(mins) {
  return Number(mins).toLocaleString('en-NG', { maximumFractionDigits: 1 });
}
function fmtBytes(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3200);
}

const STATUS_LABEL = {
  uploaded: 'Queued', queued: 'Queued', processing: 'Processing',
  completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled'
};

(async function init() {
  const ctx = await window.TranscribeGuard.requireAccess();
  if (!ctx) return;

  const { session, supabase, subscription, planConfig, remainingMinutes } = ctx;

  // If they arrived here right after signing up from an anonymous trial,
  // link that session for abuse-prevention analytics.
  window.TranscribeGuard.claimAnonymousSession(supabase, session.user.id);

  document.getElementById('pageHeader').innerHTML = `
    <div>
      <h1 style="font-size:1.4rem;">Transcribe</h1>
      <p style="font-size:0.88rem; opacity:0.7; margin-top:4px;">Upload audio or video to get a transcript.</p>
      <span class="plan-pill">${escapeHtml(planConfig?.display_name || subscription.plan)} plan</span>
    </div>
    <div class="minutes-badge">
      <div class="num">${fmtMinutes(remainingMinutes)}</div>
      <div class="lbl">Minutes remaining</div>
    </div>
  `;

  const area = document.getElementById('mainArea');
  area.innerHTML = `
    <div class="bs-panel">
      <div class="upload-zone" id="uploadZone">
        <strong>Click to upload, or drag a file here</strong>
        <p>Audio or video — MP3, WAV, M4A, MP4, MOV. Max ${planConfig?.max_file_size_mb || 200}MB, ${planConfig?.max_duration_minutes || 60} min per file.</p>
        <input type="file" id="fileInput" accept="audio/*,video/*" style="display:none;">
      </div>
      <div id="uploadProgress" style="margin-top:12px; font-size:0.82rem; opacity:0.7; display:none;"></div>
    </div>
    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Your files</strong>
      <div id="fileListWrap" style="margin-top:10px;"></div>
    </div>
  `;

  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const uploadProgress = document.getElementById('uploadProgress');

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleUpload(fileInput.files[0]);
    fileInput.value = '';
  });

  async function handleUpload(file) {
    const maxBytes = (planConfig?.max_file_size_mb || 200) * 1024 * 1024;
    if (file.size > maxBytes) {
      toast(`File too large for your plan (max ${planConfig?.max_file_size_mb || 200}MB).`);
      return;
    }
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      toast('Please upload an audio or video file.');
      return;
    }

    uploadProgress.style.display = 'block';
    uploadProgress.textContent = `Uploading ${file.name}…`;

    try {
      const fileId = crypto.randomUUID();
      const ext = file.name.split('.').pop();
      const storagePath = `${session.user.id}/${fileId}/original.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('transcription-media')
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from('transcription_files').insert({
        id: fileId,
        user_id: session.user.id,
        filename: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size_bytes: file.size,
        status: 'queued'
      });
      if (insertErr) throw insertErr;

      toast('Uploaded — queued for transcription.');
      await loadFiles();
    } catch (err) {
      toast('Upload failed: ' + err.message);
    } finally {
      uploadProgress.style.display = 'none';
    }
  }

  async function loadFiles() {
    const wrap = document.getElementById('fileListWrap');
    const { data: files, error } = await supabase
      .from('transcription_files')
      .select('id, filename, status, duration_seconds, file_size_bytes, created_at, error_message')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) { wrap.innerHTML = `<div class="empty-note">Could not load files: ${escapeHtml(error.message)}</div>`; return; }
    if (!files || !files.length) { wrap.innerHTML = '<div class="empty-note">No files yet — upload something above to get started.</div>'; return; }

    wrap.innerHTML = files.map(f => `
      <div class="file-row">
        <div>
          <div class="file-name">${escapeHtml(f.filename)}</div>
          <div class="file-meta">${fmtBytes(f.file_size_bytes)}${f.duration_seconds ? ` · ${Math.round(f.duration_seconds / 60)} min` : ''} · ${new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
          ${f.status === 'failed' && f.error_message ? `<div class="file-meta" style="color:var(--stamp-red);">${escapeHtml(f.error_message)}</div>` : ''}
        </div>
        <span class="status-pill status-${f.status}">${STATUS_LABEL[f.status] || f.status}</span>
      </div>
    `).join('');
  }

  await loadFiles();
})();
