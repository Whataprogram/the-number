/* The Number — Settle Assist content script.
 * Runs on the IRS Direct Pay page (and The Number's demo replica).
 * Reads the payment values from the URL hash that The Number opened the page with,
 * injects a small branded panel, then highlights and fills each field one at a time.
 * It NEVER clicks the final Submit — the user always authorizes the payment.
 */
(function () {
  "use strict";
  if (window.__tnSettleAssist) return; // avoid double-run
  window.__tnSettleAssist = true;

  // ---- read values The Number handed off via the URL hash ----
  var hash = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  var data = {
    reason: hash.get("reason") || "Estimated Tax",
    apply: hash.get("apply") || "1040ES",
    period: hash.get("period") || String(new Date().getFullYear()),
    amount: hash.get("amount") || "5281.02",
  };

  // ---- find each field on the page (demo replica ids first, then best-effort for the live site) ----
  function byIdOrLabel(id, labelText) {
    var el = document.getElementById(id);
    if (el) return el;
    // best-effort fallback: a <select>/<input> whose <label> text contains labelText
    var labels = Array.prototype.slice.call(document.querySelectorAll("label"));
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].textContent && labels[i].textContent.toLowerCase().indexOf(labelText.toLowerCase()) !== -1) {
        var ctl = labels[i].querySelector("select, input") || document.getElementById(labels[i].htmlFor);
        if (ctl) return ctl;
      }
    }
    return null;
  }

  var steps = [
    { el: byIdOrLabel("tn-reason", "reason for payment"), value: data.reason, label: "Reason for Payment" },
    { el: byIdOrLabel("tn-apply", "apply payment to"), value: data.apply, label: "Apply Payment To" },
    { el: byIdOrLabel("tn-period", "tax period"), value: data.period, label: "Tax Period" },
    { el: byIdOrLabel("tn-amount", "payment amount"), value: data.amount, label: "Amount" },
  ].filter(function (s) { return s.el; });

  if (!steps.length) return; // not a page we recognize

  // ---- styles + panel ----
  var style = document.createElement("style");
  style.textContent =
    ".tn-panel{position:fixed;top:16px;right:16px;width:300px;z-index:2147483647;background:#0b0b0c;color:#fafafa;border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.5);font:14px/1.45 system-ui,'Segoe UI',Arial,sans-serif;overflow:hidden}" +
    ".tn-head{display:flex;align-items:center;gap:9px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}" +
    ".tn-logo{width:26px;height:26px;border-radius:7px;background:#fafafa;color:#000;display:grid;place-items:center;font-weight:800}" +
    ".tn-title{font-weight:700}.tn-sub{font-size:11px;color:#9a9a9a}" +
    ".tn-body{padding:10px 10px 12px}" +
    ".tn-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px}" +
    ".tn-row small{display:block;color:#9a9a9a;font-size:11px}" +
    ".tn-row b{font-weight:600}" +
    ".tn-dot{width:18px;height:18px;border-radius:50%;flex:0 0 auto;border:2px solid rgba(255,255,255,.25);display:grid;place-items:center;font-size:11px}" +
    ".tn-row.done .tn-dot{background:#34d399;border-color:#34d399;color:#04210f}" +
    ".tn-row.active{background:rgba(255,255,255,.06)}" +
    ".tn-foot{padding:11px 16px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;color:#c9c9c9}" +
    ".tn-hl{outline:3px solid #34d399!important;outline-offset:2px;border-radius:4px;transition:outline .2s;scroll-margin:120px}";
  document.head.appendChild(style);

  var panel = document.createElement("div");
  panel.className = "tn-panel";
  panel.innerHTML =
    '<div class="tn-head"><div class="tn-logo">#</div><div><div class="tn-title">Settle Assist</div>' +
    '<div class="tn-sub">The Number is filling this in</div></div></div>' +
    '<div class="tn-body" id="tn-body"></div>' +
    '<div class="tn-foot" id="tn-foot">Working…</div>';
  document.body.appendChild(panel);

  var body = panel.querySelector("#tn-body");
  steps.forEach(function (s, i) {
    var row = document.createElement("div");
    row.className = "tn-row";
    row.id = "tn-step-" + i;
    row.innerHTML = '<span class="tn-dot">' + (i + 1) + "</span><div><small>" + s.label + "</small><b>" + escapeHtml(displayValue(s)) + "</b></div>";
    body.appendChild(row);
  });

  // ---- fill, one field at a time ----
  var idx = 0;
  function tick() {
    if (idx >= steps.length) {
      panel.querySelector("#tn-foot").textContent = "✓ All set — review it, then hit Continue yourself.";
      return;
    }
    var s = steps[idx];
    var row = document.getElementById("tn-step-" + idx);
    row.classList.add("active");
    s.el.classList.add("tn-hl");
    try { s.el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}

    setTimeout(function () {
      setValue(s.el, s.value);
      s.el.classList.remove("tn-hl");
      row.classList.remove("active");
      row.classList.add("done");
      row.querySelector(".tn-dot").textContent = "✓";
      idx++;
      setTimeout(tick, 420);
    }, 650);
  }
  setTimeout(tick, 500);

  // ---- helpers ----
  function setValue(el, value) {
    if (el.tagName === "SELECT") {
      var opts = el.options, matched = false;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === value || opts[i].text === value || opts[i].text.indexOf(value) !== -1) {
          el.selectedIndex = i; matched = true; break;
        }
      }
      if (!matched) el.value = value;
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function displayValue(s) {
    if (s.label === "Amount") return "$" + s.value;
    if (s.value === "1040ES") return "1040ES";
    return s.value;
  }
  function escapeHtml(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
})();
