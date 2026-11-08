// Enamel Audits front end: instant free snapshot + Stripe Checkout hand-off. No framework.
(function () {
  'use strict';
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  var sevClass = { high: '', medium: ' med', low: ' low' };
  var lastSnapshot = null;

  function postJson(url, data) {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.'); return j; }); });
  }

  // ---------- Free snapshot ----------
  var form = document.getElementById('snapshot');
  var status = document.getElementById('snap-status');
  if (form && window.fetch) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var data = { name: form.elements['name'].value, practice: form.elements['business_name'].value, url: form.elements['website'].value, email: form.elements['email'].value, hp: form.elements['hp'].value };
      btn.disabled = true;
      status.innerHTML = '<p><span class="spinner" aria-hidden="true"></span>Checking your website. This takes about 20 seconds…</p>';
      postJson('/api/snapshot', data).then(function (s) {
        lastSnapshot = s;
        var color = s.score >= 80 ? 'var(--good)' : s.score >= 60 ? 'var(--warn)' : 'var(--bad)';
        status.innerHTML = '<div class="result" tabindex="-1">' +
          '<h3>' + esc(s.host) + '</h3>' +
          '<p><span class="big" style="color:' + color + '">' + s.score + '</span> <strong>/100 &middot; Grade ' + esc(s.grade) + '</strong></p>' +
          '<p class="fine" style="margin:0">Your top ' + s.topIssues.length + ' issues:</p>' +
          s.topIssues.map(function (i) {
            return '<div class="issue' + sevClass[i.severity] + '"><span class="tag ' + i.severity + '">' + esc(i.severity) + '</span><strong>' + esc(i.title) + '</strong> ' + esc(i.impact) + '</div>';
          }).join('') +
          '<p><strong>' + s.totalIssues + ' issues found in total.</strong> The full report gives every issue with a step-by-step fix, delivered in minutes.</p>' +
          '<a class="btn btn-primary" data-plan="report" href="#pricing" style="width:100%;text-align:center">Get the full report &mdash; &#36;97</a>' +
          (s.emailed ? '<p class="fine">We also emailed this snapshot to you.</p>' : '') + '</div>';
        status.querySelector('.result').focus();
      }).catch(function (e) {
        status.innerHTML = '<p class="err">' + esc(e.message) + '</p>';
      }).then(function () { btn.disabled = false; });
    });
  }

  // ---------- Checkout ----------
  var dialog = document.getElementById('buy');
  var buyForm = document.getElementById('buy-form');
  var buyStatus = document.getElementById('buy-status');
  var planLabels = { report: 'Full Health Report — $97 one-time', monthly: 'Monitoring — $29/month, cancel anytime', annual: 'Monitoring — $290/year (2 months free)' };
  var currentPlan = 'report', fallbackHref = null;

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('[data-plan]');
    if (!a || !dialog || typeof dialog.showModal !== 'function') return; // no <dialog> support: follow the plain Stripe link
    ev.preventDefault();
    currentPlan = a.getAttribute('data-plan');
    var link = /^https:\/\/buy\.stripe\.com\//.test(a.href) ? a : document.querySelector('a[data-plan="' + currentPlan + '"][href^="https://buy.stripe.com/"]');
    fallbackHref = link ? link.href : null;
    document.getElementById('buy-plan').textContent = planLabels[currentPlan] || '';
    var u = document.getElementById('b-url'), m = document.getElementById('b-email');
    if (!u.value) u.value = (lastSnapshot && lastSnapshot.url) || (form && form.elements['website'].value) || '';
    if (!m.value && form) m.value = form.elements['email'].value || '';
    buyStatus.textContent = '';
    dialog.showModal();
    (u.value ? m : u).focus();
  });

  if (buyForm) {
    document.getElementById('buy-cancel').addEventListener('click', function () { dialog.close(); });
    buyForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var go = document.getElementById('buy-go');
      go.disabled = true;
      buyStatus.innerHTML = '<span class="spinner" aria-hidden="true"></span>Opening secure checkout…';
      postJson('/api/checkout', { plan: currentPlan, url: buyForm.elements['url'].value, email: buyForm.elements['email'].value })
        .then(function (r) { window.location.href = r.url; })
        .catch(function (e) {
          go.disabled = false;
          // If our API is down entirely, fall back to the static Stripe Payment Link so the sale isn't lost.
          if (/temporarily unavailable|Failed to fetch|NetworkError/i.test(e.message) && fallbackHref) { window.location.href = fallbackHref; return; }
          buyStatus.innerHTML = '<span class="err">' + esc(e.message) + '</span>';
        });
    });
  }

  // Error bounced back from an email checkout link
  var q = new URLSearchParams(location.search);
  if (q.get('checkout_error') && status) status.innerHTML = '<p class="err">' + esc(q.get('checkout_error')) + '</p>';
})();
