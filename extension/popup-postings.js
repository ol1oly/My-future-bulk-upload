(function () {
  "use strict";

  // "My postings": your myFuture shortlist, postings you saved, and applications in progress, with the next step for
  // each. Works without Claude and without the local bridge. With the bridge + Claude Code installed, "Package…" can
  // also have Claude write the cover letter for that posting.
  const $ = (sel) => document.querySelector(sel);
  const panel = $("#postingsPanel"), listEl = $("#postingsList"), countEl = $("#postingsCount"), syncedEl = $("#postingsSynced");
  const progressEl = $("#postingsProgress"), filtersEl = $("#postingsFilters"), noteEl = $("#postingsNote");
  const applyAllBtn = $("#applyAll"), syncBtn = $("#syncButton");
  const claudePanel = $("#claudePanel"), claudeStatus = $("#claudeStatus"), claudeRun = $("#claudeRun");
  const FILTERS = [["active", "Active"], ["prepare", "No package yet"], ["ready", "Package ready"], ["submitted", "Submitted"], ["shortlist", "★ Shortlist"]];
  const STAGE_LABEL = { submitted: "Submitted", started: "Started", ready: "Package ready", prepare: "No package yet" };
  let tab = null, onMyFuture = false, bridge = null;
  let filter = "active", items = [], docs = null, counts = {}, openPrepare = "", armedUntil = 0;

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  };
  const send = (message) => chrome.runtime.sendMessage({ ...message, tabId: tab?.id });
  const lettersReady = () => Boolean(bridge?.letters && Object.values(bridge.letters).every(Boolean));

  function say(text, bad = false) {
    progressEl.textContent = String(text || "").replace(/\s*Log: .*$/, "");
    progressEl.className = `apps-progress${bad ? " bad" : ""}`;
  }

  async function load() {
    const data = await chrome.storage.local.get({ mstApps: {}, jobTracker: {}, mfBoard: {}, mstHidden: [], mfDocs: null, mfSyncedAt: "", mfCounts: {} });
    docs = data.mfDocs;
    counts = data.mfCounts;
    const byId = new Map();
    const get = (id) => { if (!byId.has(id)) byId.set(id, { postingId: id }); return byId.get(id); };
    for (const row of Object.values(data.mfBoard)) {
      if (!row.shortlisted && !row.appStatus) continue;
      Object.assign(get(row.id), { board: row.board, title: row.title, organization: row.organization, deadlineText: row.deadlineText });
    }
    for (const card of Object.values(data.jobTracker)) {
      const id = card.postingId || (String(card.id || "").match(/^p(\d+)$/) || [])[1];
      if (!id) continue;
      const item = get(id);
      Object.assign(item, { board: item.board || card.board, title: item.title || card.title, organization: item.organization || card.organization, deadlineText: item.deadlineText || card.deadline });
    }
    for (const app of Object.values(data.mstApps)) {
      const item = get(app.postingId);
      Object.assign(item, { board: item.board || app.board, title: item.title || app.title, organization: item.organization || app.organization,
        package: app.package, packageStatus: app.packageStatus, letter: app.letter, letterName: app.letterName, planned: true, fromClaude: Boolean(app.inPlan && app.source !== "extension"),
        error: app.error, appStatus: app.appStatus || "", applied: app.applied });
    }
    for (const item of byId.values()) {
      const row = data.mfBoard[item.postingId];
      if (row) { item.shortlisted = row.shortlisted; item.appStatus = row.appStatus || ""; }
      const done = JobTools.isSubmitted(item.appStatus) || item.applied;
      item.stage = done ? "submitted" : item.appStatus ? "started" : item.packageStatus === "done" ? "ready" : "prepare";
    }
    const order = ["ready", "started", "prepare", "submitted"];
    items = [...byId.values()].filter((i) => !data.mstHidden.includes(i.postingId))
      .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || (a.organization || "").localeCompare(b.organization || ""));
    syncedEl.textContent = data.mfSyncedAt ? `synced ${new Date(data.mfSyncedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "not synced yet";
    render();
  }

  const chip = (text, cls = "") => el("span", { className: `step ${cls}`, textContent: text });
  const matches = (i, key) => key === "active" ? i.stage !== "submitted" : key === "shortlist" ? i.shortlisted && i.stage !== "submitted" : key === "prepare" ? ["prepare", "started"].includes(i.stage) && !i.packageStatus : i.stage === key;

  function render() {
    const n = Object.fromEntries(FILTERS.map(([key]) => [key, items.filter((i) => matches(i, key)).length]));
    countEl.textContent = `${n.active}`;
    filtersEl.replaceChildren(...FILTERS.map(([key, label]) => {
      const b = el("button", { type: "button", className: `filter${filter === key ? " on" : ""}`, textContent: `${label} ${n[key]}` });
      b.addEventListener("click", () => { filter = key; render(); });
      return b;
    }));
    const totalShortlist = Object.values(counts || {}).reduce((sum, c) => sum + (c?.shortlist || 0), 0);
    const openShortlist = items.filter((i) => i.shortlisted).length;
    noteEl.textContent = totalShortlist > openShortlist
      ? `Your myFuture shortlist has ${totalShortlist} postings; ${totalShortlist - openShortlist} of them are closed (deadline passed), so they're not listed here.`
      : "";
    const ready = n.ready;
    applyAllBtn.textContent = Date.now() < armedUntil ? `Click again to open ${ready} form(s)` : `Apply to all with a package (${ready})`;
    const shown = items.filter((i) => matches(i, filter));
    if (!shown.length) {
      listEl.replaceChildren(el("p", { className: "apps-empty", textContent: items.length ? "Nothing in this view."
        : onMyFuture ? "Nothing here yet. Press Sync to bring in your myFuture shortlist, or shortlist postings in Smart search."
        : "Open myFuture and press Sync to bring in your shortlist and applications." }));
      return;
    }
    listEl.replaceChildren(...shown.map(row));
  }

  function row(item) {
    const ref = { postingId: item.postingId, board: item.board || "internshipscoop", title: item.title || "", organization: item.organization || "", package: item.package || "" };
    const actions = el("div", { className: "row-actions" });
    const act = (label, cls, onClick, title = "", needsMyFuture = false) => {
      const b = el("button", { type: "button", className: cls, textContent: label, title });
      if (needsMyFuture && !onMyFuture) { b.disabled = true; b.title = "Open a myFuture page first"; }
      b.addEventListener("click", () => onClick(b));
      actions.append(b);
    };
    if (item.stage !== "submitted") {
      act(item.stage === "started" ? "Continue" : "Apply", "primary", (b) => run(b, { type: "BRIDGE_OPEN_FORMS", items: [ref] }, "Opening…"),
        item.package ? `Opens myFuture's form with package ${item.package} selected` : "Opens myFuture's form; choose your documents there");
      if (item.packageStatus !== "done") act(openPrepare === item.postingId ? "Close" : "Package…", "secondary",
        () => { openPrepare = openPrepare === item.postingId ? "" : item.postingId; render(); },
        "Build a package (CV, transcript, cover letter) before applying", true);
      act(item.shortlisted ? "★" : "☆", "secondary icon", (b) => run(b, { type: "BRIDGE_SHORTLIST", postingId: item.postingId, board: ref.board }, "…"),
        item.shortlisted ? "Remove from your myFuture shortlist" : "Add to your myFuture shortlist", true);
    }
    act("Open", "link", (b) => run(b, { type: "BRIDGE_OPEN_POSTING", item: ref }, "Opening…"), "Open the posting in a new tab");
    act("Remove", "link", (b) => run(b, { type: "BRIDGE_FORGET", postingId: item.postingId }, "Removing…"), "Hide from this list (doesn't change myFuture)");

    const chips = el("div", { className: "steps" },
      chip(STAGE_LABEL[item.stage], { submitted: "ok", ready: "ok", started: "warn" }[item.stage] || ""),
      item.shortlisted ? chip("★ Shortlisted") : null,
      item.letterName ? chip(`Letter ${item.letter === "done" ? "✓" : "○"}`, item.letter === "done" ? "ok" : "") : null,
      item.fromClaude ? chip("From Claude") : null);
    return el("div", { className: `app-row${item.stage === "submitted" ? " applied" : ""}` },
      el("div", { className: "app-main" },
        el("strong", { textContent: `${item.organization || "Posting"} — ${item.title || item.postingId}` }),
        el("span", { className: "app-meta", textContent: [item.deadlineText && `deadline ${item.deadlineText}`, item.package && `package ${item.package}`].filter(Boolean).join(" · ") }),
        chips,
        item.error ? el("span", { className: "app-error", textContent: item.error }) : null,
        openPrepare === item.postingId ? packageForm(item, ref) : null,
        actions));
  }

  function packageForm(item, ref) {
    if (!docs?.cvs?.length) return el("p", { className: "app-error", textContent: "Press Sync first so the extension knows your CVs, transcripts and cover letters on myFuture." });
    const newest = (list) => [...list].sort().reverse();
    const select = (options, extra = []) => el("select", {}, ...extra.map(([v, t]) => el("option", { value: v, textContent: t })), ...options.map((name) => el("option", { value: name, textContent: name })));
    const cv = select(newest(docs.cvs));
    const transcript = select(newest(docs.transcripts), [["", "No transcript"]]);
    if (docs.transcripts.length) transcript.value = newest(docs.transcripts)[0];
    const extra = [...(lettersReady() ? [["__claude", "Write one with Claude for this posting"]] : []), ["", "No cover letter"], ["__upload", "Upload a PDF…"]];
    const letter = select(newest(docs.coverLetters), extra);
    const file = el("input", { type: "file", accept: "application/pdf,.pdf", hidden: true });
    const write = el("button", { type: "button", className: "secondary", textContent: "Write with Claude", hidden: true });
    const sentence = el("textarea", { hidden: true, rows: 4, placeholder: "Claude's sentence about this posting appears here; edit it if you like." });
    const hint = el("small", { hidden: true, textContent: "Claude writes the one sentence about this posting from your profile; the rest is your template. Takes ~10 s, then ~1 min to make the PDF." });
    let drafted = null;
    const sync = () => {
      file.hidden = letter.value !== "__upload";
      write.hidden = hint.hidden = letter.value !== "__claude";
      sentence.hidden = letter.value !== "__claude" || !drafted;
    };
    letter.addEventListener("change", sync);
    write.addEventListener("click", async () => {
      write.disabled = true; write.textContent = "Claude is writing…";
      try {
        const reply = await send({ type: "BRIDGE_DRAFT_LETTER", item: ref });
        if (!reply?.ok) { say(`Claude couldn't write it: ${reply?.error || "no answer"}`, true); return; }
        drafted = reply.posting;
        sentence.value = reply.sentence;
        if (reply.posting?.cv && docs.cvs.some((name) => name.startsWith(`${reply.posting.cv}_`))) cv.value = newest(docs.cvs).find((name) => name.startsWith(`${reply.posting.cv}_`));
        say("Read Claude's sentence below, edit if needed, then press Create package.");
      } finally { write.disabled = false; write.textContent = "Write again"; sync(); }
    });
    const create = el("button", { type: "button", className: "primary", textContent: "Create package" });
    create.addEventListener("click", async () => {
      const choice = { cv: cv.value, transcript: transcript.value, coverLetter: ["__upload", "__claude"].includes(letter.value) ? "" : letter.value };
      if (letter.value === "__claude") {
        if (!drafted || !sentence.value.trim()) { say("Press Write with Claude first.", true); return; }
        choice.claude = { sentence: sentence.value.trim(), posting: drafted };
      }
      if (letter.value === "__upload") {
        const picked = file.files[0];
        if (!picked) { say("Choose the cover letter PDF first.", true); return; }
        const bytes = new Uint8Array(await picked.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        choice.letterFile = { name: picked.name, base64: btoa(binary) };
      }
      if (await run(create, { type: "BRIDGE_PREPARE_ONE", item: ref, choice }, "Creating…")) openPrepare = "";
    });
    sync();
    return el("div", { className: "prepare" },
      el("label", { textContent: "CV" }), cv,
      el("label", { textContent: "Transcript" }), transcript,
      el("label", { textContent: "Cover letter" }), letter, file, hint, write, sentence,
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
      refreshClaude();
    }
    return ok;
  }

  // ---------- From Claude (only with the local bridge) ----------
  function describe(log) {
    const out = [];
    for (const step of log.steps || []) {
      const r = step.result || {};
      if (step.step === "upload") {
        if (r.alreadyThere?.length) out.push(`${r.alreadyThere.length} cover letter(s) were already on myFuture.`);
        if (r.results?.length) out.push(`${r.results.filter((x) => x.status === "saved").length}/${r.results.length} cover letter(s) uploaded.`);
      }
      if (step.step === "packages") {
        if (r.alreadyExist?.length) out.push(`${r.alreadyExist.length} package(s) were already on myFuture.`);
        if (r.results?.length) out.push(`${r.results.filter((x) => x.status === "created").length}/${r.results.length} new package(s) created.`);
      }
    }
    if (log.message && !/^Done\.?$/.test(log.message)) out.push(log.message);
    return out.join(" ") || "Done.";
  }

  function showScan(reply) {
    $("#scanResult").replaceChildren(
      el("p", { textContent: `${reply.count} postings read, ${reply.matching} match. Ask Claude in Claude Code to pick from this scan. Best matches:` }),
      el("ol", {}, ...reply.top.map((p) => el("li", { textContent: `${p.score} · ${p.title} — ${p.organization}${p.mcgill ? "" : " (external)"}` }))));
  }

  function refreshClaude() {
    if (!bridge) return;
    const planned = items.filter((i) => i.fromClaude);
    const left = planned.filter((i) => i.stage === "prepare");
    claudeStatus.textContent = !planned.length
      ? "Nothing from Claude right now. In Claude Code, ask it to find and prepare internships; they appear in My postings."
      : left.length
        ? `Claude prepared ${planned.length} application(s) with tailored cover letters. ${left.length} still need their letter uploaded and package built on myFuture.`
        : `Everything Claude prepared (${planned.length}) has its package on myFuture. Apply from My postings.`;
    claudeRun.hidden = !left.length;
    claudeRun.textContent = `Upload letters & build packages (${left.length})`;
  }

  async function initClaude() {
    bridge = await send({ type: "BRIDGE_STATUS" });
    if (!bridge?.ok) { bridge = null; return; }
    claudePanel.hidden = false;
    refreshClaude();
    for (const [id, type, busy, board] of [["#claudeRun", "BRIDGE_RUN_PLAN", "Working…"], ["#scanCoop", "BRIDGE_SCAN", "Reading…", "internshipscoop"], ["#scanCareer", "BRIDGE_SCAN", "Reading…", "career"]]) {
      const b = $(id);
      if (!onMyFuture) { b.disabled = true; b.title = "Open a myFuture page first"; continue; }
      b.addEventListener("click", () => run(b, { type, board }, busy));
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
      if (!ready.length) { say("No posting has a package yet. Use Apply on a posting (you choose documents in myFuture), or Package… first.", true); return; }
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
