(function () {
  "use strict";

  // "My postings": one list of everything the student is working on — postings they saved, their myFuture
  // shortlist, applications prepared here or by Claude — with what to do next for each. Works without Claude and
  // without the local bridge; the "From Claude" section appears only when the bridge is installed.
  const $ = (sel) => document.querySelector(sel);
  const panel = $("#postingsPanel"), listEl = $("#postingsList"), countEl = $("#postingsCount"), syncedEl = $("#postingsSynced");
  const progressEl = $("#postingsProgress"), filtersEl = $("#postingsFilters"), applyAllBtn = $("#applyAll"), syncBtn = $("#syncButton");
  const claudePanel = $("#claudePanel"), claudeStatus = $("#claudeStatus");
  const STAGES = { submitted: "Submitted", started: "Started", ready: "Ready to apply", prepare: "To prepare" };
  const FILTERS = [["all", "All"], ["prepare", "To prepare"], ["ready", "Ready"], ["started", "Started"], ["submitted", "Submitted"], ["shortlist", "★ Shortlist"]];
  let tab = null, onMyFuture = false, bridgeOk = false;
  let filter = "all", items = [], docs = null, openPrepare = "", armedUntil = 0;

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  };
  const send = (message) => chrome.runtime.sendMessage({ ...message, tabId: tab?.id });
  const submitted = (status) => JobTools.isSubmitted(status);

  function say(text, bad = false) {
    progressEl.textContent = text.replace(/\s*Log: .*$/, "");
    progressEl.className = `apps-progress${bad ? " bad" : ""}`;
  }

  async function load() {
    const data = await chrome.storage.local.get({ mstApps: {}, jobTracker: {}, mfBoard: {}, mstHidden: [], mfDocs: null, mfSyncedAt: "", mstRequests: [] });
    docs = data.mfDocs;
    const byId = new Map();
    const get = (id) => { if (!byId.has(id)) byId.set(id, { postingId: id }); return byId.get(id); };
    for (const row of Object.values(data.mfBoard)) {
      if (!row.shortlisted && !row.appStatus) continue;
      Object.assign(get(row.id), { board: row.board, title: row.title, organization: row.organization, deadlineText: row.deadlineText, shortlisted: row.shortlisted, appStatus: row.appStatus || "" });
    }
    for (const card of Object.values(data.jobTracker)) {
      const id = card.postingId || (String(card.id || "").match(/^p(\d+)$/) || [])[1];
      if (!id) continue;
      const item = get(id);
      Object.assign(item, { saved: true, board: item.board || card.board, title: item.title || card.title, organization: item.organization || card.organization, deadlineText: item.deadlineText || card.deadline });
    }
    for (const app of Object.values(data.mstApps)) {
      const item = get(app.postingId);
      Object.assign(item, { board: item.board || app.board, title: item.title || app.title, organization: item.organization || app.organization,
        package: app.package, packageStatus: app.packageStatus, letter: app.letter, letterName: app.letterName, planned: true, error: app.error,
        appStatus: item.appStatus ?? app.appStatus ?? "", applied: app.applied });
    }
    const board = data.mfBoard;
    for (const item of byId.values()) {
      if (board[item.postingId]) { item.shortlisted = board[item.postingId].shortlisted; item.appStatus = board[item.postingId].appStatus || ""; }
      item.stage = submitted(item.appStatus) || item.applied ? "submitted" : item.appStatus ? "started" : item.packageStatus === "done" ? "ready" : "prepare";
      item.requested = data.mstRequests.some((r) => r.postingId === item.postingId);
    }
    items = [...byId.values()].filter((i) => !data.mstHidden.includes(i.postingId))
      .sort((a, b) => ["ready", "started", "prepare", "submitted"].indexOf(a.stage) - ["ready", "started", "prepare", "submitted"].indexOf(b.stage) || (a.organization || "").localeCompare(b.organization || ""));
    syncedEl.textContent = data.mfSyncedAt ? `synced ${new Date(data.mfSyncedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "not synced yet";
    render();
  }

  function chip(text, cls = "") { return el("span", { className: `step ${cls}`, textContent: text }); }

  function render() {
    const counts = { all: items.length, shortlist: items.filter((i) => i.shortlisted).length };
    for (const stage of Object.keys(STAGES)) counts[stage] = items.filter((i) => i.stage === stage).length;
    countEl.textContent = `${items.length}`;
    filtersEl.replaceChildren(...FILTERS.map(([key, label]) => {
      const b = el("button", { type: "button", className: `filter${filter === key ? " on" : ""}`, textContent: `${label} ${counts[key] || 0}` });
      b.addEventListener("click", () => { filter = key; render(); });
      return b;
    }));
    const ready = counts.ready || 0;
    applyAllBtn.textContent = Date.now() < armedUntil ? `Click again to open ${ready} form(s)` : `Apply to all ready (${ready})`;
    const shown = items.filter((i) => filter === "all" || (filter === "shortlist" ? i.shortlisted : i.stage === filter));
    if (!items.length) {
      listEl.replaceChildren(el("p", { className: "apps-empty", textContent: onMyFuture
        ? "Nothing here yet. Press Sync to bring in your myFuture shortlist, use Add to My postings on a posting, or shortlist from Smart search."
        : "Open myFuture to sync your shortlist and applications." }));
      return;
    }
    listEl.replaceChildren(...shown.map(row));
  }

  function row(item) {
    const stageCls = { submitted: "ok", started: "warn", ready: "ok", prepare: "" }[item.stage];
    const actions = el("div", { className: "row-actions" });
    const act = (label, cls, onClick, title = "") => {
      const b = el("button", { type: "button", className: cls, textContent: label, title });
      b.addEventListener("click", () => onClick(b));
      actions.append(b);
      return b;
    };
    const needsMyFuture = (b) => { if (!onMyFuture) { b.disabled = true; b.title = "Open a myFuture page first"; } };
    const ref = { postingId: item.postingId, board: item.board || "internshipscoop", title: item.title || "", organization: item.organization || "", package: item.package || "" };

    if (item.stage === "ready") act("Apply", "primary", (b) => run(b, { type: "BRIDGE_OPEN_FORMS", items: [ref] }, "Opening…"), "Opens myFuture's form with this package pre-selected");
    if (item.stage === "started") act("Continue", "primary", (b) => run(b, { type: "BRIDGE_OPEN_FORMS", items: [ref] }, "Opening…"), "Reopens myFuture's application form");
    if (item.stage === "prepare") {
      needsMyFuture(act(openPrepare === item.postingId ? "Close" : "Prepare…", "primary", () => { openPrepare = openPrepare === item.postingId ? "" : item.postingId; render(); },
        "Choose CV, transcript and cover letter; creates a package on myFuture"));
      act("Apply", "secondary", (b) => run(b, { type: "BRIDGE_OPEN_FORMS", items: [ref] }, "Opening…"), "Open the form and choose your documents there");
    }
    if (item.stage !== "submitted") needsMyFuture(act(item.shortlisted ? "★" : "☆", "secondary icon", (b) => run(b, { type: "BRIDGE_SHORTLIST", postingId: item.postingId, board: ref.board }, "…"),
      item.shortlisted ? "Remove from your myFuture shortlist" : "Add to your myFuture shortlist"));
    act("Open", "link", (b) => run(b, { type: "BRIDGE_OPEN_POSTING", item: ref }, "Opening…"), "Open the posting in a new tab");
    if (bridgeOk && item.stage === "prepare" && !item.requested) act("Ask Claude", "link", (b) => run(b, { type: "BRIDGE_REQUEST_PREP", item: ref }, "Saving…"), "Claude writes a tailored cover letter and prepares this application");
    act("Remove", "link", (b) => run(b, { type: "BRIDGE_FORGET", postingId: item.postingId }, "Removing…"), "Remove from My postings (doesn't change myFuture)");

    const chips = el("div", { className: "steps" },
      chip(STAGES[item.stage], stageCls),
      item.shortlisted ? chip("★ Shortlisted", "") : null,
      item.letterName ? chip(`Letter ${item.letter === "done" ? "✓" : "○"}`, item.letter === "done" ? "ok" : "") : null,
      item.package ? chip(`Package ${item.packageStatus === "done" ? "✓" : item.packageStatus === "failed" ? "✗" : "○"}`, item.packageStatus === "done" ? "ok" : item.packageStatus === "failed" ? "bad" : "") : null,
      item.requested ? chip("Asked Claude", "") : null,
      item.appStatus && item.stage === "started" ? chip(item.appStatus, "warn") : null);
    return el("div", { className: `app-row${item.stage === "submitted" ? " applied" : ""}` },
      el("div", { className: "app-main" },
        el("strong", { textContent: `${item.organization || "Posting"} — ${item.title || item.postingId}` }),
        el("span", { className: "app-meta", textContent: [item.deadlineText && `deadline ${item.deadlineText}`, item.package && `package ${item.package}`].filter(Boolean).join(" · ") }),
        chips,
        item.error ? el("span", { className: "app-error", textContent: item.error }) : null,
        openPrepare === item.postingId ? prepareForm(item, ref) : null,
        actions));
  }

  function prepareForm(item, ref) {
    if (!docs?.cvs?.length) {
      return el("p", { className: "app-error", textContent: "Press Sync first so the extension knows your CVs, transcripts and cover letters on myFuture." });
    }
    const select = (options, extra = []) => el("select", {}, ...extra.map(([v, t]) => el("option", { value: v, textContent: t })), ...options.map((name) => el("option", { value: name, textContent: name })));
    const newest = (list) => [...list].sort().reverse();
    const cv = select(newest(docs.cvs));
    const transcript = select(newest(docs.transcripts), [["", "No transcript"]]);
    if (docs.transcripts.length) transcript.value = newest(docs.transcripts)[0];
    const letter = select(newest(docs.coverLetters), [["", "No cover letter"], ["__upload", "Upload a PDF…"]]);
    const file = el("input", { type: "file", accept: "application/pdf,.pdf", hidden: true });
    letter.addEventListener("change", () => { file.hidden = letter.value !== "__upload"; });
    const create = el("button", { type: "button", className: "primary", textContent: "Create package" });
    create.addEventListener("click", async () => {
      const choice = { cv: cv.value, transcript: transcript.value, coverLetter: letter.value === "__upload" ? "" : letter.value };
      if (letter.value === "__upload") {
        const picked = file.files[0];
        if (!picked) { say("Choose the cover letter PDF first.", true); return; }
        const bytes = new Uint8Array(await picked.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        choice.letterFile = { name: picked.name, base64: btoa(binary) };
      }
      const ok = await run(create, { type: "BRIDGE_PREPARE_ONE", item: ref, choice }, "Creating…");
      if (ok) openPrepare = "";
    });
    return el("div", { className: "prepare" },
      el("label", { textContent: "CV" }), cv,
      el("label", { textContent: "Transcript" }), transcript,
      el("label", { textContent: "Cover letter" }), letter, file,
      create);
  }

  async function run(button, message, busy) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busy;
    let ok = false;
    try {
      const reply = await send(message);
      ok = Boolean(reply?.ok);
      say(ok ? reply.message || (reply.log ? describe(reply.log) : "Done.") : `Stopped: ${reply?.error || "no answer"}`, !ok);
      if (ok && reply.top) showScan(reply);
    } finally {
      button.textContent = label;
      button.disabled = false;
      await load();
    }
    return ok;
  }

  // ---------- From Claude (bridge) ----------
  function describe(log) {
    const out = [];
    for (const step of log.steps || []) {
      const r = step.result || {};
      if (step.step === "resolve") out.push(`Found ${r.cvs} CV(s) and ${r.transcripts} transcript(s).`);
      if (step.step === "upload") {
        if (r.alreadyThere?.length) out.push(`${r.alreadyThere.length} cover letter(s) already on myFuture.`);
        if (r.results?.length) out.push(`${r.results.filter((x) => x.status === "saved").length}/${r.results.length} cover letter(s) uploaded.`);
        if (log.dryRun && r.dryRun) out.push("New cover letters can be uploaded.");
      }
      if (step.step === "packages") {
        if (r.alreadyExist?.length) out.push(`${r.alreadyExist.length} package(s) already on myFuture.`);
        if (log.dryRun && r.dryRun) out.push(`${(r.packages || []).length} new package(s) can be created.`);
        else if (r.results?.length) out.push(`${r.results.filter((x) => x.status === "created").length}/${r.results.length} new package(s) created.`);
      }
      if (step.step === "probe") out.push("Saved one application form for Claude.");
    }
    if (log.message && !/^(Done\.?|Check finished.*)$/.test(log.message)) out.push(log.message);
    return out.join(" ") || log.message || "Done.";
  }

  function showScan(reply) {
    $("#scanResult").replaceChildren(
      el("p", { textContent: `${reply.count} postings read, ${reply.matching} match. Ask Claude to “apply from my scan”. Best matches:` }),
      el("ol", {}, ...reply.top.map((p) => el("li", { textContent: `${p.score} · ${p.title} — ${p.organization}${p.mcgill ? "" : " (external)"}` }))));
  }

  async function initClaude() {
    const status = await send({ type: "BRIDGE_STATUS" });
    bridgeOk = Boolean(status?.ok);
    if (!bridgeOk) return;
    claudePanel.hidden = false;
    const planned = status.plan?.applications || [];
    const letters = planned.filter((a) => a.letterPdf).length;
    claudeStatus.textContent = planned.length
      ? `Claude planned ${planned.length} application(s)${letters ? `, ${letters} with a tailored cover letter` : ""}. They appear in My postings. Check tests them; Prepare uploads the letters and builds the packages. Nothing is submitted.`
      : "Connected. Ask Claude to find and prepare postings for you; they will appear in My postings.";
    $("#claudeSteps").hidden = !planned.length;
    for (const [id, type, busy] of [["#claudeCheck", "BRIDGE_CHECK_PLAN", "Checking…"], ["#claudeRun", "BRIDGE_RUN_PLAN", "Preparing…"],
      ["#scanCoop", "BRIDGE_SCAN", "Reading…"], ["#scanCareer", "BRIDGE_SCAN", "Reading…"]]) {
      const b = $(id);
      if (!onMyFuture) { b.disabled = true; b.title = "Open a myFuture page first"; continue; }
      b.addEventListener("click", () => run(b, { type, board: id === "#scanCareer" ? "career" : "internshipscoop" }, busy));
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "BRIDGE_PROGRESS" && tab && message.tabId === tab.id) say(message.text);
    if (message?.type === "BRIDGE_APPS") load();
  });

  async function init() {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    onMyFuture = /^https:\/\/myfuture\.mcgill\.ca\//.test(tab?.url || "");
    panel.hidden = false;
    if (!onMyFuture) { syncBtn.disabled = true; syncBtn.title = "Open a myFuture page first"; }
    syncBtn.addEventListener("click", () => run(syncBtn, { type: "BRIDGE_SYNC" }, "Syncing…"));
    applyAllBtn.addEventListener("click", () => {
      const ready = items.filter((i) => i.stage === "ready");
      if (!ready.length) { say(items.some((i) => i.stage === "prepare") ? "Nothing is ready yet: press Prepare… on a posting (or Sync if you already prepared)." : "Nothing is waiting to be applied to.", true); return; }
      if (Date.now() > armedUntil) { armedUntil = Date.now() + 5000; render(); setTimeout(render, 5100); return; }
      armedUntil = 0;
      run(applyAllBtn, { type: "BRIDGE_OPEN_FORMS", items: ready.map((i) => ({ postingId: i.postingId, board: i.board || "internshipscoop", title: i.title || "", organization: i.organization || "", package: i.package || "" })) }, "Opening forms…");
    });
    await load();
    await initClaude();
    render();
  }

  init();
})();
