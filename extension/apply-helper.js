// Runs on every myFuture page. If this tab was opened by the extension to apply to a posting, show a banner on each
// page of myFuture's application form and pre-select the package prepared for it (when the form offers a package
// choice). It never clicks Submit: the student reviews and submits.
(() => {
  "use strict";
  if (window.top !== window || document.getElementById("mst-apply-banner")) return;

  function norm(text) {
    return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Select the option / radio / checkbox whose text is the package name. Returns what was selected, or "".
  function preselect(packageName) {
    if (!packageName) return "";
    const target = norm(packageName);
    for (const select of document.querySelectorAll("select")) {
      const option = [...select.options].find((o) => norm(o.text) === target);
      if (!option) continue;
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return "select";
    }
    for (const input of document.querySelectorAll("input[type=radio], input[type=checkbox]")) {
      const label = input.closest("label") || (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) || input.parentElement;
      if (!label || norm(label.innerText) !== target) continue;
      if (!input.checked) input.click(); // a radio/checkbox click only toggles it; it doesn't submit anything
      return input.type;
    }
    return "";
  }

  function show(context) {
    const bar = document.createElement("div");
    bar.id = "mst-apply-banner";
    bar.setAttribute("role", "status");
    bar.style.cssText = "position:sticky;top:0;z-index:2147483000;background:#ed1b2f;color:#fff;font:600 14px/1.4 system-ui,'Segoe UI',sans-serif;padding:10px 16px;display:flex;gap:12px;align-items:center";
    const text = document.createElement("span");
    text.style.flex = "1";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Hide";
    close.style.cssText = "background:#fff;color:#c4122d;border:0;border-radius:6px;padding:4px 10px;font:600 12px system-ui,sans-serif;cursor:pointer";
    close.addEventListener("click", () => bar.remove());
    bar.append(text, close);
    document.body.prepend(bar);

    let picked = "";
    const render = () => {
      if (!picked) picked = preselect(context.package); // select once; never override the student's own choice later
      const what = context.title ? `Applying to ${context.title}${context.organization ? ` — ${context.organization}` : ""}. ` : "";
      text.textContent = context.done ? `${what}Submitted ✓ — press Sync in the extension to update My postings.` : context.package
        ? picked
          ? `${what}Package “${context.package}” is selected for you. Review, then submit.`
          : `${what}Choose the package “${context.package}” when myFuture asks for documents, then submit.`
        : `${what}Choose your documents, review, then submit.`;
    };
    render();
    // Forms that load their document choices late: try again for a few seconds.
    let tries = 0;
    const timer = setInterval(() => { tries += 1; render(); if (tries > 10) clearInterval(timer); }, 700);
  }

  // Only pages of THIS posting's application get the banner; anything else means the student moved on.
  function belongsTo(context) {
    if (document.querySelector("#postingsTable")) return false; // a postings list lists every posting
    const text = norm(document.body?.innerText || "");
    const id = String(context.postingId || "");
    const idOnPage = id && (text.includes(id) || [...document.querySelectorAll("input[type=hidden]")].some((i) => i.value === id));
    const title = norm(context.title).slice(0, 40);
    return Boolean(idOnPage || (title.length > 8 && text.includes(title)));
  }

  function submitted() {
    return /application (has been )?submitted|successfully submitted|candidature (a été )?soumise/i.test(document.body?.innerText || "");
  }

  chrome.runtime.sendMessage({ type: "APPLY_CONTEXT" }).then((context) => {
    if (!context?.postingId) return;
    if (!belongsTo(context)) { chrome.runtime.sendMessage({ type: "APPLY_DONE" }).catch(() => {}); return; }
    if (submitted()) {
      show({ ...context, package: "", done: true });
      chrome.runtime.sendMessage({ type: "APPLY_DONE" }).catch(() => {});
      return;
    }
    show(context);
  }).catch(() => {});
})();
