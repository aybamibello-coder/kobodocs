// Owner-only admin dashboard access check. Doesn't call is_kobodocs_admin
// separately -- get_admin_dashboard_stats() itself enforces the same
// check server-side and throws 'not authorized' for anyone else, so a
// single RPC call both authorizes AND fetches the data.
window.AdminGuard = {
  fetchStats: function () {
    return new Promise(function (resolve, reject) {
      if (window.KoboAuth) return resolve();
      window.addEventListener('kobo-auth-ready', function () { resolve(); }, { once: true });
    }).then(function () {
      return window.KoboAuth.getSession();
    }).then(function (session) {
      if (!session) return Promise.reject({ code: 'AUTH_REQUIRED' });
      return window.KoboAuth.supabase.rpc('get_admin_dashboard_stats').then(function (res) {
        if (res.error) {
          if (res.error.message === 'not authorized') return Promise.reject({ code: 'FORBIDDEN' });
          return Promise.reject({ code: 'FETCH_FAILED', detail: res.error.message });
        }
        return res.data;
      });
    });
  }
};
