function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3200);
}
function fmtTimeShort(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtSrtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msRem).padStart(3, '0')}`;
}
function fmtVttTime(ms) {
  return fmtSrtTime(ms).replace(',', '.');
}
function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PLAN_TIER = { free: 0, starter: 1, pro: 2, business: 3 };

(async function init() {
  const ctx = await window.TranscribeGuard.requireAccess();
  if (!ctx) return;
  const { session, supabase, subscription } = ctx;

  const fileId = new URLSearchParams(window.location.search).get('id');
  if (!fileId) {
    document.getElementById('mainArea').innerHTML = '<div class="empty-note">No file specified.</div>';
    return;
  }

  const { data: file, error: fileErr } = await supabase
    .from('transcription_files')
    .select('*')
    .eq('id', fileId)
    .maybeSingle();

  if (fileErr || !file) {
    document.getElementById('mainArea').innerHTML = '<div class="empty-note">File not found, or you don\'t have access to it.</div>';
    return;
  }

  const planTier = PLAN_TIER[subscription.plan] ?? 0;

  document.getElementById('pageHeader').innerHTML = `
    <div>
      <h1 style="font-size:1.3rem;">${escapeHtml(file.filename)}</h1>
      <p style="font-size:0.82rem; opacity:0.65; margin-top:4px;">
        ${file.duration_seconds ? Math.round(file.duration_seconds / 60) + ' min · ' : ''}
        Uploaded ${new Date(file.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  `;

  const area = document.getElementById('mainArea');

  if (file.status !== 'completed') {
    const msg = file.status === 'failed'
      ? `Transcription failed${file.error_message ? ': ' + escapeHtml(file.error_message) : '.'}`
      : `Still ${file.status === 'processing' ? 'processing' : 'queued'} — this page will update once it's done. Feel free to check back shortly.`;
    area.innerHTML = `<div class="bs-panel"><div class="empty-note">${msg}</div></div>`;
    return;
  }

  const { data: transcript } = await supabase
    .from('transcripts')
    .select('id, full_text, language')
    .eq('file_id', fileId)
    .maybeSingle();

  if (!transcript) {
    area.innerHTML = '<div class="bs-panel"><div class="empty-note">Transcript not available.</div></div>';
    return;
  }

  const [{ data: speakers }, { data: segments }] = await Promise.all([
    supabase.from('transcript_speakers').select('*').eq('transcript_id', transcript.id),
    supabase.from('transcript_segments').select('*').eq('transcript_id', transcript.id).order('sort_order', { ascending: true })
  ]);

  const speakerById = {};
  (speakers || []).forEach(s => { speakerById[s.id] = s; });

  function speakerLabel(seg) {
    if (!seg.speaker_id) return null;
    const sp = speakerById[seg.speaker_id];
    return sp ? (sp.display_name || sp.speaker_label) : null;
  }

  area.innerHTML = `
    <div class="bs-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <strong style="font-size:0.9rem;">Transcript</strong>
        <div class="export-row">
          <button class="btn small" id="copyBtn">Copy text</button>
          <button class="btn small" id="exportTxt">Export .txt</button>
          <button class="btn small" id="exportSrt">Export .srt</button>
          <button class="btn small" id="exportVtt">Export .vtt</button>
        </div>
      </div>
      <div id="segmentsWrap">
        ${(segments && segments.length) ? segments.map(seg => `
          <div class="seg-row">
            <div class="seg-time">${fmtTimeShort(seg.start_ms)}</div>
            <div class="seg-body">
              ${speakerLabel(seg) ? `<div class="seg-speaker" data-speaker-id="${seg.speaker_id}">${escapeHtml(speakerLabel(seg))}</div>` : ''}
              <div class="seg-text">${escapeHtml(seg.text)}</div>
            </div>
          </div>
        `).join('') : `<div class="seg-text">${escapeHtml(transcript.full_text || '')}</div>`}
      </div>
    </div>

    <div class="bs-panel">
      <strong style="font-size:0.9rem;">AI summary</strong>
      ${planTier >= 1 ? `
        <div id="summaryWrap" style="margin-top:10px;">
          <button class="btn small primary" id="summarizeBtn">Generate summary</button>
        </div>
      ` : `<div class="plan-lock" style="margin-top:10px;">AI summaries are available on the Starter plan and above. <a href="/transcribe/#pricing">See plans</a></div>`}
    </div>

    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Translate</strong>
      <div id="translateWrap" style="margin-top:10px;">
        <div class="tr-lang-row">
          <select id="translateLangSelect">
            <option value="yo">Yoruba</option>
            <option value="ig">Igbo</option>
            <option value="ha">Hausa</option>
            <option value="pcm">Nigerian Pidgin</option>
            <option value="fr">French</option>
            <option value="de">German</option>
          </select>
          <button class="btn small primary" id="translateBtn">Translate</button>
        </div>
        <p style="font-size:0.78rem; opacity:0.6; margin-top:8px;">
          ${planTier >= 2 ? 'Included on your plan — translate to as many languages as you like.' : 'Free plan: your first translation each month is fully unlocked. After that, translations show a preview with an upgrade option.'}
        </p>
        <div id="translateResult"></div>
      </div>
    </div>
  `;

  // ---------- Speaker rename ----------
  area.querySelectorAll('[data-speaker-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const speakerId = el.dataset.speakerId;
      const current = speakerById[speakerId]?.display_name || speakerById[speakerId]?.speaker_label || '';
      const name = prompt('Rename this speaker:', current);
      if (!name || name === current) return;

      const { error } = await supabase.from('transcript_speakers').update({ display_name: name }).eq('id', speakerId);
      if (error) { toast('Could not rename speaker: ' + error.message); return; }

      speakerById[speakerId].display_name = name;
      area.querySelectorAll(`[data-speaker-id="${speakerId}"]`).forEach(node => { node.textContent = name; });
      toast('Speaker renamed.');
    });
  });

  // ---------- Exports (generated client-side from already-loaded data) ----------
  function fullTextForExport() {
    if (!segments || !segments.length) return transcript.full_text || '';
    return segments.map(seg => {
      const label = speakerLabel(seg);
      return `${label ? label + ': ' : ''}${seg.text}`;
    }).join('\n\n');
  }

  document.getElementById('copyBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(fullTextForExport());
    toast('Copied to clipboard.');
  });

  document.getElementById('exportTxt').addEventListener('click', () => {
    downloadBlob(`${file.filename}.txt`, fullTextForExport(), 'text/plain');
  });

  document.getElementById('exportSrt').addEventListener('click', () => {
    if (!segments || !segments.length) { toast('No timed segments available for subtitles.'); return; }
    const srt = segments.map((seg, i) => {
      const label = speakerLabel(seg);
      return `${i + 1}\n${fmtSrtTime(seg.start_ms)} --> ${fmtSrtTime(seg.end_ms)}\n${label ? label + ': ' : ''}${seg.text}\n`;
    }).join('\n');
    downloadBlob(`${file.filename}.srt`, srt, 'text/plain');
  });

  document.getElementById('exportVtt').addEventListener('click', () => {
    if (!segments || !segments.length) { toast('No timed segments available for subtitles.'); return; }
    const vtt = 'WEBVTT\n\n' + segments.map(seg => {
      const label = speakerLabel(seg);
      return `${fmtVttTime(seg.start_ms)} --> ${fmtVttTime(seg.end_ms)}\n${label ? label + ': ' : ''}${seg.text}\n`;
    }).join('\n');
    downloadBlob(`${file.filename}.vtt`, vtt, 'text/vtt');
  });

  // ---------- AI summary ----------
  if (planTier >= 1) {
    const summaryWrap = document.getElementById('summaryWrap');

    // Show a cached summary if one already exists for this file.
    const { data: existingJob } = await supabase
      .from('transcription_jobs')
      .select('*')
      .eq('file_id', fileId)
      .eq('job_type', 'summarize')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    function renderSummary(result) {
      summaryWrap.innerHTML = `
        <button class="btn small" id="summarizeBtn">Regenerate summary</button>
        <div class="ai-result">
          <p>${escapeHtml(result.summary || '')}</p>
          ${result.key_points?.length ? `<strong style="font-size:0.82rem;">Key points</strong><ul>${result.key_points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
          ${result.action_items?.length ? `<strong style="font-size:0.82rem;">Action items</strong><ul>${result.action_items.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
        </div>
      `;
      document.getElementById('summarizeBtn').addEventListener('click', generateSummary);
    }

    async function generateSummary() {
      const btn = document.getElementById('summarizeBtn');
      btn.disabled = true;
      btn.textContent = 'Summarizing…';
      try {
        const { data, error } = await supabase.functions.invoke('transcribe-summarize', { body: { file_id: fileId } });
        if (error || data?.error) {
          toast('Could not summarize: ' + (data?.error || error.message));
          return;
        }
        renderSummary(data.result);
      } finally {
        if (document.getElementById('summarizeBtn')) {
          document.getElementById('summarizeBtn').disabled = false;
        }
      }
    }

    if (existingJob?.result) {
      renderSummary(existingJob.result);
    } else {
      document.getElementById('summarizeBtn').addEventListener('click', generateSummary);
    }
  }

  // ---------- Translate ----------
  {
    const langSelect = document.getElementById('translateLangSelect');
    const translateBtn = document.getElementById('translateBtn');
    const resultEl = document.getElementById('translateResult');

    function renderTranslation(data) {
      if (data.locked) {
        const remaining = Math.max(0, (data.total_length || 0) - (data.text || '').length);
        resultEl.innerHTML = `
          <div class="ai-result">
            <p>${escapeHtml(data.text || '')}</p>
            <div class="tr-blur-block" aria-hidden="true">
              ${Array.from({ length: 4 }).map(() => `<div class="tr-blur-line"></div>`).join('')}
            </div>
            <div class="plan-lock" style="margin-top:10px;">
              ${remaining > 0 ? 'The rest of this translation (' + remaining.toLocaleString() + ' more characters) is locked.' : 'The rest of this translation is locked.'}
              You already used this month's free translation — upgrade for unlimited translations in any language.
              <br><a href="/transcribe/#pricing" class="btn small primary" style="margin-top:8px; display:inline-block;">Upgrade to unlock</a>
            </div>
          </div>
        `;
      } else {
        resultEl.innerHTML = `
          <div class="ai-result">
            <p style="white-space:pre-wrap;">${escapeHtml(data.text || '')}</p>
            <div class="export-row" style="margin-top:10px;">
              <button class="btn small" id="copyTranslationBtn">Copy text</button>
              <button class="btn small" id="downloadTranslationBtn">Download .txt</button>
            </div>
          </div>
        `;
        document.getElementById('copyTranslationBtn')?.addEventListener('click', async () => {
          await navigator.clipboard.writeText(data.text || '');
          toast('Copied to clipboard.');
        });
        document.getElementById('downloadTranslationBtn')?.addEventListener('click', () => {
          downloadBlob(`${file.filename} (${data.language_name || 'translation'}).txt`, data.text || '', 'text/plain');
        });
      }
    }

    async function runTranslate() {
      const language = langSelect.value;
      translateBtn.disabled = true;
      translateBtn.textContent = 'Translating…';
      resultEl.innerHTML = '';
      try {
        const { data, error } = await supabase.functions.invoke('transcribe-translate', { body: { file_id: fileId, language } });
        if (error || data?.error) {
          toast('Could not translate: ' + (data?.error || error.message));
          return;
        }
        renderTranslation(data);
      } finally {
        translateBtn.disabled = false;
        translateBtn.textContent = 'Translate';
      }
    }

    translateBtn.addEventListener('click', runTranslate);
  }
})();
