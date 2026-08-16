// Shared usage tracker for the free PDF tools. Every tool page already
// calls a local track(name, params) function -- previously that only
// fed Google Analytics, which isn't queryable anywhere outside the GA
// UI. This adds a second, parallel sink into a Supabase table so the
// owner's admin dashboard can actually see this activity.
//
// Deliberately a plain script (not a module), using a raw fetch() to
// PostgREST rather than depending on supabase-js/auth.js -- most free
// tool pages don't load those at all, and tracking must work regardless.
// Must never throw or block the tool it's instrumenting.
(function () {
  var SUPABASE_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3bXp1bHpsdWF4ZWRrb3p4amZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MTA0NTQsImV4cCI6MjA5OTI4NjQ1NH0.Al0MtKGl54CuzImaiCM6wburmxDlNz30VmEqM7fAh6Q';

  window.KoboTrack = function (name, params) {
    try {
      if (typeof gtag === 'function') {
        try { gtag('event', name, params || {}); } catch (e) { /* no-op */ }
      }
      var tool = (params && params.tool) || 'unknown';
      fetch(SUPABASE_URL + '/rest/v1/tool_usage_events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ event_name: name, tool: tool, params: params || {} }),
        keepalive: true
      }).catch(function () { /* best-effort only */ });
    } catch (e) { /* tracking must never break the actual tool */ }
  };
})();
