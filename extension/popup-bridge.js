(function () {
  "use strict";

  // Applications panel: shows every planned application and where it stands (letter → package → applied), and runs
  // the local bridge jobs (check, prepare, open application forms, refresh). Results are shown here in plain words;
  // the JSON logs in ~/.mst/out are only for scripts.
  const $ = (id) => document.querySelector(id);
  const panel = $("#bridgePanel"), statusLine = $("#bridgeStatus"), progressLine = $("#bridgeProgress");
  const steps = $("#appsSteps"), list = $("#appsList"), summary = $("#appsSummary"), scanResult = $("#scanResult");
  const buttons = { check: $("#bridgeCheck"), run: $("#bridgeRun"), applyAll: $("#bridgeApplyAll"), refresh: $("#bridgeRefresh"), coop: $("#bridgeScanCoop"), career: $("#bridgeScanCareer") };
  let tab = null;
  let readyCount = 0;
  let armedUntil = 0; // "Apply to all" needs a second click within 5 s

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  };
  const send = (message) => chrome.runtime.sendMessage({ ...message, tabId: tab.id });

  function stepChip(label, state) {
    const map = { done: ["✓", "ok"], failed: ["✗", "bad"], todo: ["○", ""], none: ["—", "muted"] };
    const [mark, cls] = map[state] || ["○", ""];
    return el("span", { className: `step ${cls}`, textContent: `${label} ${mark}`, title: { done: "done", failed: "failed", todo: "not done yet", none: "not needed" }[state] || "" });
  }

  function applyAllLabel() {
    buttons.applyAll.textContent = Date.now() < armedUntil ? `Click again to open ${readyCount} form(s)` : `3 · Apply to all ready (${readyCount})`;
  }

  function renderApps(apps) {
    const rows = Object.values(apps || {}).filter((app) => app.inPlan || app.applied || app.packageStatus === "done")
      .sort((a, b) => Number(a.applied) - Number(b.applied) || (a.organization || "").localeCompare(b.organization || ""));
    readyCount = rows.filter((a) => a.packageStatus === "done" && !a.applied).length;
    const applied = rows.filter((a) => a.applied).length;
    summary.textContent = rows.length ? `${rows.length} · ${readyCount} ready · ${applied} applied` : "";
    applyAllLabel();
    buttons.applyAll.disabled = !readyCount;
    list.replaceChildren(...rows.map((app) => {
      const open = el("button", { type: "button", className: "link", textContent: "Open form", title: "Open myFuture's application form for this posting in a new tab" });
      open.addEventListener("click", () => job(open, { type: "BRIDGE_OPEN_FORMS", postingIds: [app.postingId] }, "Opening…"));
      return el("div", { className: `app-row${app.applied ? " applied" : ""}` },
        el("div", { className: "app-main" },
          el("strong", { textContent: `${app.organization || "Posting"} — ${app.title || app.postingId}` }),
          el("span", { className: "app-meta", textContent: [app.package && `package ${app.package}`, app.cvUsed && `CV ${app.cvUsed}`].filter(Boolean).join(" · ") }),
          el("div", { className: "steps" },
            stepChip("Letter", app.letter || "none"),
            stepChip("Package", app.packageStatus || "todo"),
            stepChip("Applied", app.applied ? "done" : "todo"),
            app.checked && app.checked !== "ok" ? el("span", { className: "step bad", textContent: app.checked }) : null),
          app.error ? el("span", { className: "app-error", textContent: app.error }) : null),
        !app.applied && app.packageStatus === "done" ? open : null);
    }));
  }

  // Plain-language summary of a check / prepare log.
  function describe(log) {
    if (!log) return "";
    const out = [];
    for (const step of log.steps || []) {
      const r = step.result || {};
      if (step.step === "resolve") out.push(`Found ${r.cvs} CV(s) and ${r.transcripts} transcript(s) on myFuture.`);
      if (step.step === "upload") {
        if (log.dryRun) out.push(r.dryRun ? "The cover letters can be uploaded." : "The cover letters could not be checked.");
        else {
          const saved = (r.results || []).filter((x) => x.status === "saved").length;
          out.push(`${saved}/${(r.results || []).length} cover letter(s) uploaded.`);
        }
      }
      if (step.step === "packages") {
        if (r.alreadyExist?.length) out.push(`${r.alreadyExist.length} package(s) already existed and were kept.`);
        if (log.dryRun) out.push(r.dryRun ? `${(r.packages || []).length} package(s) can be created.` : "The packages could not be checked.");
        else if (r.results) out.push(`${r.results.filter((x) => x.status === "created").length}/${r.results.length} package(s) created.`);
      }
      if (step.step === "probe") out.push("Saved one application form so the submit step can be automated next.");
    }
    if (log.message && !/^Done\.?$/.test(log.message)) out.push(log.message.replace(/\s*Log: .*$/, ""));
    return out.join(" ");
  }

  async function refreshView() {
    const status = await send({ type: "BRIDGE_STATUS" });
    renderApps(status?.apps);
    return status;
  }

  async function job(button, message, busyText) {
    const label = button.textContent;
    const all = Object.values(buttons);
    all.forEach((b) => { b.disabled = true; });
    button.textContent = busyText;
    progressLine.className = "apps-progress";
    try {
      const reply = await send(message);
      if (!reply?.ok) {
        progressLine.textContent = `Stopped: ${reply?.error || "no answer"}`;
        progressLine.className = "apps-progress bad";
      } else {
        progressLine.textContent = reply.log ? describe(reply.log) : (reply.message || "Done.").replace(/\s*Log: .*$/, "");
        if (reply.top) showScan(reply);
      }
    } finally {
      button.textContent = label;
      all.forEach((b) => { b.disabled = false; });
      await refreshView();
    }
  }

  function showScan(reply) {
    scanResult.replaceChildren(
      el("p", { textContent: `${reply.count} postings read; ${reply.matching} match your Smart search filters. Ask Claude to “apply from my scan”. Best matches:` }),
      el("ol", {}, ...reply.top.map((p) => el("li", { textContent: `${p.score} · ${p.title} — ${p.organization}${p.mcgill ? "" : " (external site)"}` }))));
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!tab) return;
    if (message?.type === "BRIDGE_PROGRESS" && message.tabId === tab.id) progressLine.textContent = message.text.replace(/\s*Log: .*$/, "");
    if (message?.type === "BRIDGE_APPS") refreshView();
  });

  async function init() {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/myfuture\.mcgill\.ca\//.test(tab.url || "")) return;
    panel.hidden = false;
    const status = await refreshView();
    if (!status?.ok) {
      statusLine.textContent = "The local bridge isn't installed, so Claude can't hand you applications yet (see the README: native\\install_host.ps1). Smart search works without it.";
      steps.hidden = true;
      buttons.coop.disabled = buttons.career.disabled = true;
      return;
    }
    const planned = status.plan?.applications || [];
    const letters = planned.filter((a) => a.letterPdf).length;
    statusLine.textContent = planned.length
      ? `Claude prepared ${planned.length} application(s)${letters ? `, ${letters} with a cover letter` : ""}. Go through the steps in order; nothing is submitted until you submit it in myFuture.`
      : "No applications waiting. Ask Claude to pick postings for you, or use Smart search.";
    steps.hidden = !planned.length && !Object.keys(status.apps || {}).length;
    $("#prepareHint").textContent = `Uploads ${letters} cover letter(s) and creates ${planned.length} application package(s) on myFuture. Submits nothing.`;
    buttons.check.addEventListener("click", () => job(buttons.check, { type: "BRIDGE_CHECK_PLAN" }, "Checking…"));
    buttons.run.addEventListener("click", () => job(buttons.run, { type: "BRIDGE_RUN_PLAN" }, "Preparing…"));
    buttons.applyAll.addEventListener("click", () => {
      if (Date.now() > armedUntil) { armedUntil = Date.now() + 5000; applyAllLabel(); setTimeout(applyAllLabel, 5100); return; }
      armedUntil = 0;
      job(buttons.applyAll, { type: "BRIDGE_OPEN_FORMS" }, "Opening forms…");
    });
    buttons.refresh.addEventListener("click", () => job(buttons.refresh, { type: "BRIDGE_REFRESH" }, "Checking…"));
    buttons.coop.addEventListener("click", () => job(buttons.coop, { type: "BRIDGE_SCAN", board: "internshipscoop" }, "Reading postings…"));
    buttons.career.addEventListener("click", () => job(buttons.career, { type: "BRIDGE_SCAN", board: "career" }, "Reading postings…"));
  }

  init();
})();
