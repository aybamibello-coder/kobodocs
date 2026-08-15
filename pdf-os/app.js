// PDF OS — page glue. Loading/validating files reuses the same signature
// check as merge.js; this file just wires the dropzone + chat form to
// PdfOsAgent.run() and renders the turn-by-turn log.
(function () {
  'use strict';

  var authGate = document.getElementById('pdfOsAuthGate');
  var app = document.getElementById('pdfOsApp');
  var dropzone = document.getElementById('pdfOsDropzone');
  var fileInput = document.getElementById('pdfOsFileInput');
  var fileListEl = document.getElementById('pdfOsFileList');
  var chatLog = document.getElementById('pdfOsChatLog');
  var form = document.getElementById('pdfOsForm');
  var input = document.getElementById('pdfOsInput');
  var sendBtn = document.getElementById('pdfOsSendBtn');
  var usageEl = document.getElementById('pdfOsUsage');
  var upgradeProBtn = document.getElementById('pdfOsUpgradeProBtn');
  var vaultListEl = document.getElementById('pdfOsVaultList');
  var vaultMetaEl = document.getElementById('pdfOsVaultMeta');

  upgradeProBtn.addEventListener('click', function () {
    window.KoboSubscribe.start('init-pdf-os-payment', { plan: 'pro', billing_cycle: 'monthly' });
  });

  if (window.KoboSubscribe && window.KoboSubscribe.resumePendingIfAny) {
    window.KoboSubscribe.resumePendingIfAny();
  }

  var files = [];
  var idSeq = 0;

  window.PdfOsGuard.checkAccess().then(function (access) {
    if (access.plan === 'anonymous') {
      authGate.hidden = false;
      return;
    }
    app.hidden = false;
    renderUsage(access);
    refreshVault();
  });

  function renderUsage(access) {
    var limits = { free: [10, 15], pro: [300, 999999], business: [999999, 999999] };
    var lim = limits[access.plan] || limits.free;
    usageEl.textContent = access.usage.agent_runs_used + '/' + lim[0] + ' requests · ' +
      access.usage.ai_actions_used + '/' + lim[1] + ' AI actions used this period (' + access.plan + ' plan)';
  }

  dropzone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function (e) { addFiles(e.target.files); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.add('pdf-dropzone-active'); });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.remove('pdf-dropzone-active'); });
  });
  dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  function addFiles(fileList) {
    Array.prototype.slice.call(fileList).forEach(function (file) {
      file.arrayBuffer().then(function (buf) {
        files.push({ id: 'u_' + (++idSeq), name: file.name, size: file.size, arrayBuffer: buf, pages: null });
        renderFileList();
      });
    });
  }

  var FILE_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';

  function renderFileList() {
    fileListEl.innerHTML = '';
    files.forEach(function (f, idx) {
      var li = document.createElement('li');
      li.className = 'pdf-file-card';
      li.innerHTML =
        '<span class="pdf-file-icon">' + FILE_ICON_SVG + '</span>' +
        '<span class="pdf-file-info">' +
          '<span class="pdf-file-name">' + escapeHtml(f.name) + '</span>' +
          '<span class="pdf-file-meta">' + formatBytes(f.size) + '</span>' +
        '</span>' +
        '<span class="pdf-file-controls"></span>';
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'pdf-file-btn pdf-file-remove';
      removeBtn.setAttribute('aria-label', 'Remove ' + f.name);
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      removeBtn.addEventListener('click', function () {
        files.splice(idx, 1);
        renderFileList();
      });
      li.querySelector('.pdf-file-controls').appendChild(removeBtn);
      fileListEl.appendChild(li);
    });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function refreshVault() {
    window.PdfOsVault.list().then(function (rows) {
      vaultMetaEl.textContent = rows.length + ' document' + (rows.length === 1 ? '' : 's') + ' saved';
      vaultListEl.innerHTML = '';
      rows.forEach(function (row) {
        var li = document.createElement('li');
        li.className = 'pdf-file-card';
        li.innerHTML =
          '<span class="pdf-file-icon">' + FILE_ICON_SVG + '</span>' +
          '<span class="pdf-file-info">' +
            '<span class="pdf-file-name">' + escapeHtml(row.file_name) + '</span>' +
            '<span class="pdf-file-meta">' + formatBytes(row.size_bytes) + '</span>' +
          '</span>' +
          '<span class="pdf-file-controls"></span>';
        var controls = li.querySelector('.pdf-file-controls');

        var dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.className = 'pdf-file-btn';
        dlBtn.setAttribute('aria-label', 'Download ' + row.file_name);
        dlBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/></svg>';
        dlBtn.addEventListener('click', function () {
          window.PdfOsVault.getDownloadUrl(row.id).then(function (url) { window.open(url, '_blank'); });
        });

        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'pdf-file-btn pdf-file-remove';
        delBtn.setAttribute('aria-label', 'Delete ' + row.file_name);
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>';
        delBtn.addEventListener('click', function () {
          window.PdfOsVault.remove(row.id).then(refreshVault);
        });

        controls.appendChild(dlBtn);
        controls.appendChild(delBtn);
        vaultListEl.appendChild(li);
      });
    }).catch(function () {
      vaultMetaEl.textContent = 'Could not load your Vault.';
    });
  }

  function offerSaveToVault(outputFiles) {
    outputFiles.forEach(function (f) {
      var div = document.createElement('div');
      div.className = 'pdf-os-chat-turn pdf-os-chat-agent';
      var label = document.createElement('span');
      label.textContent = 'Produced: ' + f.name + '  ';
      var saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = 'Save to Vault';
      saveBtn.addEventListener('click', function () {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        window.PdfOsVault.save(f).then(function () {
          saveBtn.textContent = 'Saved';
          refreshVault();
        }).catch(function (err) {
          saveBtn.disabled = false;
          saveBtn.textContent = err.code === 'VAULT_LIMIT_REACHED' ? 'Vault full — upgrade to save more' : 'Save failed — retry';
        });
      });
      div.appendChild(label);
      div.appendChild(saveBtn);
      chatLog.appendChild(div);
    });
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var message = input.value.trim();
    if (!message) return;

    appendChat('user', message);
    input.value = '';
    sendBtn.disabled = true;

    var uploadedIds = {};
    files.forEach(function (f) { uploadedIds[f.id] = true; });

    window.PdfOsAgent.run(message, files, {
      onStep: function (step) {
        if (step.phase === 'executing') {
          appendChat('agent', 'Running: ' + step.calls.map(function (c) { return c.name; }).join(', ') + '…');
        }
      },
      onDone: function (result) {
        appendChat('agent', result.text);
        var produced = Object.keys(result.fileStore || {})
          .filter(function (id) { return !uploadedIds[id]; })
          .map(function (id) { return result.fileStore[id]; });
        if (produced.length) offerSaveToVault(produced);
        sendBtn.disabled = false;
        window.PdfOsGuard.checkAccess().then(renderUsage);
      },
      onError: function (err) {
        var msg = err.code === 'QUOTA_EXCEEDED'
          ? 'You have used all your requests for this period. Upgrade to keep going.'
          : err.code === 'AUTH_REQUIRED'
          ? 'Please sign in to continue.'
          : 'Something went wrong running that request. Please try again.';
        appendChat('agent', msg);
        sendBtn.disabled = false;
      }
    });
  });

  function appendChat(role, text) {
    var div = document.createElement('div');
    div.className = 'pdf-os-chat-turn pdf-os-chat-' + role;
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
})();
