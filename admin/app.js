(function () {
  'use strict';

  var loadingEl = document.getElementById('adminLoading');
  var deniedEl = document.getElementById('adminDenied');
  var dashEl = document.getElementById('adminDashboard');

  var PRODUCT_LABELS = {
    pdf_toolkit: 'PDF Toolkit', pdf_os: 'PDF OS', payroll: 'Payroll', esign: 'E-Signature',
    receivable_manager: 'Receivable Manager', wht: 'WHT Tracker', freelance_tax: 'Freelancer Tax & Invoicing',
    transcription: 'Transcription', business_suite: 'Business Suite', business_suite_growth: 'Business Suite (Growth)',
    business_teams: 'Business Teams', cooperative_plan: 'Cooperative Plan', japa_pass: 'Japa Pass',
    tool_pass: 'Tool Pass', siwes_report: 'SIWES Report', grant_application_generator: 'Grant Application Generator',
    school_report_card: 'School Report Card', event_pass: 'Event Pass', contract_scanner: 'Contract Scanner',
    client_document_payment: 'Client Document Payment', legacy_pro: 'Legacy Pro Plan', unknown: 'Unknown',
    merge_pdf: 'Merge PDF', split_pdf: 'Split PDF', compress_pdf: 'Compress PDF', jpg_to_pdf: 'JPG/PNG to PDF',
    pdf_to_jpg: 'PDF to JPG', word_to_pdf: 'Word to PDF', watermark_pdf: 'Watermark PDF', ocr_pdf: 'OCR PDF'
  };
  function label(key) { return PRODUCT_LABELS[key] || key; }

  window.AdminGuard.fetchStats().then(function (stats) {
    loadingEl.hidden = true;
    dashEl.hidden = false;
    render(stats);
  }).catch(function (err) {
    loadingEl.hidden = true;
    if (err.code === 'AUTH_REQUIRED') {
      window.location.href = '/account/?next=/admin/';
      return;
    }
    deniedEl.hidden = false;
  });

  function fmtNaira(n) { return '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 }); }
  function fmtNum(n) { return Number(n || 0).toLocaleString('en-NG'); }

  function statCard(label, value) {
    var div = document.createElement('div');
    div.className = 'admin-stat-card';
    div.innerHTML = '<div class="label">' + label + '</div><div class="value">' + value + '</div>';
    return div;
  }

  function render(stats) {
    document.getElementById('adminGeneratedAt').textContent = 'As of ' + new Date(stats.generated_at).toLocaleString('en-NG');

    var signupsGrid = document.getElementById('signupsGrid');
    signupsGrid.appendChild(statCard('Today', fmtNum(stats.signups.today)));
    signupsGrid.appendChild(statCard('Last 7 days', fmtNum(stats.signups.last_7_days)));
    signupsGrid.appendChild(statCard('Last 30 days', fmtNum(stats.signups.last_30_days)));
    signupsGrid.appendChild(statCard('All time', fmtNum(stats.signups.all_time)));

    var revenueGrid = document.getElementById('revenueGrid');
    revenueGrid.appendChild(statCard('Today', fmtNaira(stats.revenue_naira.today)));
    revenueGrid.appendChild(statCard('Last 7 days', fmtNaira(stats.revenue_naira.last_7_days)));
    revenueGrid.appendChild(statCard('Last 30 days', fmtNaira(stats.revenue_naira.last_30_days)));
    revenueGrid.appendChild(statCard('All time', fmtNaira(stats.revenue_naira.all_time)));

    var revBody = document.querySelector('#revenueByProductTable tbody');
    if (!stats.revenue_by_product_30d.length) {
      document.getElementById('revenueByProductEmpty').hidden = false;
    } else {
      stats.revenue_by_product_30d.forEach(function (row) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + label(row.product) + '</td><td>' + fmtNaira(row.amount) + '</td><td>' + fmtNum(row.count) + '</td>';
        revBody.appendChild(tr);
      });
    }

    var subsBody = document.querySelector('#activeSubsTable tbody');
    stats.active_subscriptions_by_product.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + label(row.product) + '</td><td>' + fmtNum(row.active_count) + '</td>';
      subsBody.appendChild(tr);
    });

    var oneTimeGrid = document.getElementById('oneTimeGrid');
    oneTimeGrid.appendChild(statCard('Japa Pass', fmtNum(stats.one_time_purchases_30d.japa_pass)));
    oneTimeGrid.appendChild(statCard('Tool Access Passes', fmtNum(stats.one_time_purchases_30d.tool_access_passes)));

    var usageGrid = document.getElementById('usageGrid');
    var usageLabels = {
      pdf_os_documents_in_vault: 'PDF OS Vault docs', transcription_jobs: 'Transcription jobs',
      ajo_circles_total: 'Ajo circles (all time)', ajo_contributions: 'Ajo contributions',
      compliance_assistant_queries: 'Compliance assistant queries', contract_scans: 'Contract scans',
      documents_created: 'Documents created', business_suite_expenses_logged: 'Expenses logged'
    };
    Object.keys(usageLabels).forEach(function (key) {
      usageGrid.appendChild(statCard(usageLabels[key], fmtNum(stats.usage_highlights_30d[key])));
    });

    var bizGrid = document.getElementById('businessSnapshotGrid');
    var bizLabels = { total_businesses: 'Businesses', total_clients: 'Clients', total_receivables: 'Receivables', total_events: 'Events' };
    Object.keys(bizLabels).forEach(function (key) {
      bizGrid.appendChild(statCard(bizLabels[key], fmtNum(stats.business_suite_snapshot[key])));
    });

    // Free tool usage -- previously only visible in Google Analytics,
    // not queryable from here at all.
    document.getElementById('toolEventsToday').textContent = fmtNum(stats.tool_events_today);
    document.getElementById('toolEventsAllTime').textContent = fmtNum(stats.tool_events_all_time);
    var toolBody = document.querySelector('#freeToolTable tbody');
    if (!stats.free_tool_usage_30d.length) {
      document.getElementById('freeToolEmpty').hidden = false;
    } else {
      stats.free_tool_usage_30d.forEach(function (row) {
        var rate = row.views > 0 ? Math.round((row.completions / row.views) * 100) + '%' : '—';
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + label(row.tool) + '</td><td>' + fmtNum(row.views) + '</td><td>' + fmtNum(row.completions) + '</td><td>' + fmtNum(row.downloads) + '</td><td>' + rate + '</td>';
        toolBody.appendChild(tr);
      });
    }

    // Daily trend chart -- signups + tool events (left axis, bars) vs
    // revenue (right axis, line) across the full 30-day window, so daily/
    // weekly/monthly patterns are visible at a glance, not just totals.
    var days = stats.daily_series_30d.map(function (d) { return d.day.slice(5); });
    new Chart(document.getElementById('trendChart'), {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          { label: 'Signups', data: stats.daily_series_30d.map(function (d) { return d.signups; }), backgroundColor: '#C79A3C', yAxisID: 'y' },
          { label: 'Tool events', data: stats.daily_series_30d.map(function (d) { return d.tool_events; }), backgroundColor: '#14342B', yAxisID: 'y' },
          { label: 'Revenue (₦)', data: stats.daily_series_30d.map(function (d) { return d.revenue; }), type: 'line', borderColor: '#A8342A', backgroundColor: 'transparent', yAxisID: 'y1', tension: 0.3 }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: { position: 'left', beginAtZero: true, title: { display: true, text: 'Count' } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: '₦' } }
        }
      }
    });
  }
})();
