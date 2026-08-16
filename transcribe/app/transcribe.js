function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Public anon key — safe to expose client-side (same one used in
// assets/auth.js). Hardcoded here rather than reading it off the
// supabase-js client instance, since supabaseUrl/supabaseKey aren't a
// documented public API on that object and could change across versions.
const SUPABASE_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4HDVb8ZzRh1W-Z97m2uT1Q_4FwH6bTt';
function fmtMinutes(mins) {
  return Number(mins).toLocaleString('en-NG', { maximumFractionDigits: 1 });
}
function fmtBytes(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}
function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)} min`;
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

const FILE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

(async function init() {
  const ctx = await window.TranscribeGuard.requireAccess();
  if (!ctx) return;

  const { session, supabase, subscription, planConfig, remainingMinutes } = ctx;

  window.TranscribeGuard.claimAnonymousSession(supabase, session.user.id);

  document.getElementById('pageHeader').innerHTML = `
    <div>
      <h1 style="font-size:1.4rem;">Transcribe</h1>
      <p style="font-size:0.88rem; opacity:0.7; margin-top:4px;">Upload audio or video to get a transcript.</p>
      <span class="plan-pill">${escapeHtml(planConfig?.display_name || subscription.plan)} plan</span>
    </div>
    ${subscription.plan === 'free' ? '<button id="upgradeBtn" class="btn primary small">Upgrade</button>' : ''}
  `;
  document.getElementById('upgradeBtn')?.addEventListener('click', () => { window.location.href = '/transcribe/#pricing'; });

  const area = document.getElementById('mainArea');
  area.innerHTML = `
    ${subscription.plan === 'free' ? `
    <div class="upsell-strip">
      <span>Free plan gives you 10 minutes a month. Upgrade for AI summaries, translation, and more.</span>
      <a href="/transcribe/#pricing" class="btn small">See plans</a>
    </div>` : ''}
    <div class="stats-row">
      <div class="rm-stat ${remainingMinutes < 5 ? 'warn' : ''}">
        <div class="rm-stat-label">Minutes left</div>
        <div class="rm-stat-value">${fmtMinutes(remainingMinutes)}</div>
      </div>
      <div class="rm-stat">
        <div class="rm-stat-label">Files this period</div>
        <div class="rm-stat-value" id="statFileCount">—</div>
      </div>
      <div class="rm-stat">
        <div class="rm-stat-label">Minutes transcribed</div>
        <div class="rm-stat-value" id="statMinutesUsed">${fmtMinutes(subscription.minutes_used_this_period)}</div>
      </div>
    </div>

    <div class="bs-panel">
      <div class="upload-zone" id="uploadZone">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <div><strong>Click to upload, or drag a file here</strong></div>
        <p>Audio or video — MP3, WAV, M4A, MP4, MOV. Max ${planConfig?.max_file_size_mb || 200}MB, ${planConfig?.max_duration_minutes || 60} min per file.</p>
        <input type="file" id="fileInput" accept="audio/*,video/*" style="display:none;">
      </div>
      <div id="progressCard"></div>
    </div>
    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Your files</strong>
      <div id="fileListWrap" style="margin-top:10px;"></div>
    </div>
  `;

  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const progressCard = document.getElementById('progressCard');

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

  async function getMediaDuration(file) {
    return new Promise((resolve) => {
      const el = file.type.startsWith('video/') ? document.createElement('video') : document.createElement('audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        // Some MP4/WebM containers report Infinity until a seek — nudge it.
        if (el.duration === Infinity || isNaN(el.duration)) {
          el.currentTime = 1e101;
          el.ontimeupdate = () => {
            el.ontimeupdate = null;
            URL.revokeObjectURL(el.src);
            resolve(isFinite(el.duration) ? el.duration : null);
          };
        } else {
          URL.revokeObjectURL(el.src);
          resolve(el.duration);
        }
      };
      el.onerror = () => { URL.revokeObjectURL(el.src); resolve(null); };
      el.src = URL.createObjectURL(file);
    });
  }

  // XHR (not fetch) specifically because it exposes real upload progress
  // events — fetch has no equivalent for outgoing request bodies.
  function uploadWithProgress(path, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${SUPABASE_URL}/storage/v1/object/transcription-media/${encodeURI(path)}`;
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
      xhr.send(file);
    });
  }

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

    progressCard.innerHTML = `
      <div class="progress-card">
        <div class="pc-name">${escapeHtml(file.name)}</div>
        <div class="progress-track"><div class="progress-fill" id="progressFill" style="width:0%;"></div></div>
        <div class="progress-status" id="progressStatus">Checking file…</div>
      </div>
    `;
    const fill = document.getElementById('progressFill');
    const status = document.getElementById('progressStatus');

    const durationSeconds = await getMediaDuration(file);

    if (durationSeconds && planConfig?.max_duration_minutes && durationSeconds / 60 > planConfig.max_duration_minutes) {
      progressCard.innerHTML = '';
      toast(`This file is ${Math.round(durationSeconds / 60)} min — your plan's limit is ${planConfig.max_duration_minutes} min per file.`);
      return;
    }
    if (durationSeconds && durationSeconds / 60 > remainingMinutes) {
      progressCard.innerHTML = '';
      toast(`This file (${Math.round(durationSeconds / 60)} min) is longer than your ${fmtMinutes(remainingMinutes)} remaining minutes.`);
      return;
    }

    try {
      const fileId = crypto.randomUUID();
      const ext = file.name.split('.').pop();
      const storagePath = `${session.user.id}/${fileId}/original.${ext}`;

      status.textContent = 'Uploading… 0%';
      await uploadWithProgress(storagePath, file, (pct) => {
        fill.style.width = pct + '%';
        status.textContent = `Uploading… ${pct}%`;
      });

      const { error: insertErr } = await supabase.from('transcription_files').insert({
        id: fileId,
        user_id: session.user.id,
        filename: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size_bytes: file.size,
        duration_seconds: durationSeconds,
        status: 'queued'
      });
      if (insertErr) throw insertErr;

      fill.classList.add('indeterminate');
      status.textContent = 'Starting transcription…';
      await loadFiles();
      startPolling();

      const { data: startResult, error: startErr } = await supabase.functions.invoke('transcribe-start', {
        body: { file_id: fileId }
      });
      if (startErr || startResult?.error) {
        toast('Could not start transcription: ' + (startResult?.error || startErr.message));
      } else {
        toast('Transcription started.');
      }
      await loadFiles();
    } catch (err) {
      toast('Upload failed: ' + err.message);
    } finally {
      setTimeout(() => { progressCard.innerHTML = ''; }, 1200);
    }
  }

  let pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      const stillPending = await loadFiles();
      if (!stillPending) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 5000);
  }

  async function refreshStats() {
    const { data: sub } = await supabase.from('transcription_subscriptions').select('*').eq('user_id', session.user.id).maybeSingle();
    if (!sub) return;
    const allowanceLeft = Math.max(0, Number(sub.minutes_allowance) - Number(sub.minutes_used_this_period));
    const totalLeft = allowanceLeft + Number(sub.minutes_balance);
    const badge = document.querySelector('.stats-row .rm-stat:nth-child(1) .rm-stat-value');
    if (badge) badge.textContent = fmtMinutes(totalLeft);
    const usedEl = document.getElementById('statMinutesUsed');
    if (usedEl) usedEl.textContent = fmtMinutes(sub.minutes_used_this_period);
  }

  function fileIconFor(mime) {
    return FILE_ICON; // single consistent glyph for now — audio vs video icon variants can follow later
  }

  async function loadFiles() {
    const wrap = document.getElementById('fileListWrap');
    const { data: files, error } = await supabase
      .from('transcription_files')
      .select('id, filename, status, duration_seconds, file_size_bytes, created_at, error_message, mime_type')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    document.getElementById('statFileCount').textContent = files ? files.length : '—';

    if (error) { wrap.innerHTML = `<div class="empty-note">Could not load files: ${escapeHtml(error.message)}</div>`; return false; }
    if (!files || !files.length) { wrap.innerHTML = '<div class="empty-note">No files yet — upload something above to get started.</div>'; return false; }

    wrap.innerHTML = files.map(f => {
      const durationLabel = fmtDuration(f.duration_seconds);
      const metaParts = [fmtBytes(f.file_size_bytes)];
      if (f.status === 'completed' || f.status === 'processing') {
        metaParts.push(durationLabel ? durationLabel : (f.status === 'processing' ? 'estimating…' : null));
      }
      metaParts.push(new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));

      return `
      <a href="/transcribe/app/view/?id=${f.id}" class="file-card">
        <div class="file-icon">${fileIconFor(f.mime_type)}</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(f.filename)}</div>
          <div class="file-meta">${metaParts.filter(Boolean).join(' · ')}</div>
          ${f.status === 'failed' && f.error_message ? `<div class="file-meta" style="color:var(--stamp-red);">${escapeHtml(f.error_message)}</div>` : ''}
        </div>
        <span class="status-pill status-${f.status}">${STATUS_LABEL[f.status] || f.status}</span>
      </a>
    `;
    }).join('');

    const pending = files.some(f => f.status === 'queued' || f.status === 'processing');
    if (!pending) await refreshStats();
    return pending;
  }

  if (await loadFiles()) startPolling();
})();
