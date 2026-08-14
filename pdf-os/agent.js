// ---------- PDF OS agent orchestrator ----------
// The planning LLM call happens server-side (pdf-os-agent-plan edge
// function) — it never sees file bytes, only a manifest (name/size/page
// count) plus the running conversation. That keeps the same privacy
// posture as the rest of the site: files stay client-side unless a
// specific REMOTE tool genuinely needs them.
(function () {
  'use strict';

  var FN_BASE = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';
  var MAX_STEPS = 8; // hard ceiling so a bad plan can't loop forever

  window.PdfOsAgent = { run: run };

  // files: array of { id, name, size, pages, arrayBuffer } — already
  // validated/loaded client-side, same as merge.js / compress.js do today.
  function run(userMessage, files, callbacks) {
    callbacks = callbacks || {};
    var onStep = callbacks.onStep || function () {};
    var onDone = callbacks.onDone || function () {};
    var onError = callbacks.onError || function () {};

    window.PdfOsGuard.checkAccess().then(function (access) {
      if (access.plan === 'anonymous') {
        return onError({ code: 'AUTH_REQUIRED' });
      }

      var fileManifest = files.map(function (f) {
        return { id: f.id, name: f.name, size: f.size, pages: f.pages };
      });

      // fileStore lets LOCAL tool handlers pull the real bytes/blobs by id,
      // and lets later steps operate on outputs of earlier steps.
      var fileStore = {};
      files.forEach(function (f) { fileStore[f.id] = f; });

      var conversation = [{ role: 'user', content: userMessage }];

      stepLoop(0, conversation, fileManifest, fileStore, access, onStep, onDone, onError);
    }).catch(onError);
  }

  function stepLoop(stepIndex, conversation, fileManifest, fileStore, access, onStep, onDone, onError) {
    if (stepIndex >= MAX_STEPS) {
      return onError({ code: 'MAX_STEPS_EXCEEDED' });
    }

    plan(conversation, fileManifest, access).then(function (planResult) {
      // planResult: { type: 'final', text } OR { type: 'tool_calls', calls: [...], assistant_turn }

      if (planResult.type === 'final') {
        return onDone({ text: planResult.text, fileStore: fileStore });
      }

      onStep({ phase: 'executing', calls: planResult.calls });

      executeCalls(planResult.calls, fileStore, access).then(function (results) {
        conversation.push(planResult.assistant_turn);
        conversation.push({ role: 'tool_results', content: results });

        // newly produced files (e.g. a merged PDF) become available to
        // the next planning turn and to subsequent tool calls.
        results.forEach(function (r) {
          if (r.output_file) fileStore[r.output_file.id] = r.output_file;
        });
        var updatedManifest = Object.keys(fileStore).map(function (id) {
          var f = fileStore[id];
          return { id: f.id, name: f.name, size: f.size, pages: f.pages };
        });

        stepLoop(stepIndex + 1, conversation, updatedManifest, fileStore, access, onStep, onDone, onError);
      }).catch(onError);
    }).catch(onError);
  }

  // ---- Planning: server-side LLM call, sees manifest only, never file bytes ----
  function plan(conversation, fileManifest, access) {
    return Promise.resolve(access.session.access_token).then(function (token) {
      return fetch(FN_BASE + '/pdf-os-agent-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          conversation: conversation,
          file_manifest: fileManifest,
          tools: window.PdfOsTools.map(function (t) {
            return { name: t.name, description: t.description, input_schema: t.input_schema };
          })
        })
      }).then(function (res) {
        if (!res.ok) throw { code: 'PLAN_FAILED', status: res.status };
        return res.json();
      });
    });
  }

  // ---- Execution: dispatch each call LOCAL (pdf-lib, in-browser) or REMOTE (edge fn) ----
  function executeCalls(calls, fileStore, access) {
    var chain = Promise.resolve();
    var results = [];

    calls.forEach(function (call) {
      chain = chain.then(function () {
        var toolDef = window.PdfOsTools.filter(function (t) { return t.name === call.name; })[0];
        if (!toolDef) {
          results.push({ call_id: call.id, error: 'UNKNOWN_TOOL' });
          return;
        }
        var exec = toolDef.dispatch === 'LOCAL'
          ? window.PdfOsLocalTools[call.name](call.input, fileStore)
          : executeRemoteTool(toolDef, call, fileStore, access);

        return Promise.resolve(exec).then(function (result) {
          results.push({ call_id: call.id, name: call.name, output_file: result.output_file, output_text: result.output_text });
        }).catch(function (err) {
          results.push({ call_id: call.id, name: call.name, error: err && err.code || 'TOOL_FAILED' });
        });
      });
    });

    return chain.then(function () { return results; });
  }

  // REMOTE tools send prepared document content (text layer, or rendered
  // page images) as JSON — never a raw PDF file. Rendering happens here,
  // client-side, via PdfOsExtractClient (same reasoning as the proven
  // ocr-pdf-pages function: the edge runtime has no reliable canvas to
  // render PDF pages with).
  function executeRemoteTool(toolDef, call, fileStore, access) {
    var file = fileStore[call.input.file_id];
    return window.PdfOsExtractClient.prepare(file).then(function (documentInput) {
      return Promise.resolve(access.session.access_token).then(function (token) {
        return fetch(FN_BASE + '/' + toolDef.edge_function, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({
            document_input: documentInput,
            question: call.input.question,
            fields: call.input.fields
          })
        }).then(function (res) {
          if (res.status === 402) throw { code: 'QUOTA_EXCEEDED' };
          if (!res.ok) throw { code: 'REMOTE_TOOL_FAILED', status: res.status };
          return res.json();
        });
      });
    });
  }
})();
