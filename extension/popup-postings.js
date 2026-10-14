(function () {
  "use strict";

  // "My postings": your myFuture shortlist, postings you saved, and applications in progress, with the next step for
  // each. Works without Claude and without the local bridge. With the bridge + Claude Code installed, "Package…" can
  // also have Claude write the cover letter for that posting.
  const $ = (sel) => document.querySelector(sel);
  const panel = $("#postingsPanel"), listEl = $("#postingsList"), countEl = $("#postingsCount"), syncedEl = $("#postingsSynced");
  const progressEl = $("#postingsProgress"), filtersEl = $("#postingsFilters"), noteEl = $("#postingsNote");
  const applyAllBtn = $("#applyAll"), syncBtn = $("#syncButton"), findBtn = $("#findMatches");
  const claudePanel = $("#claudePanel"), claudeStatus = $("#claudeStatus"), claudeRun = $("#claudeRun");
  const FILTERS = [["active", "Active"], ["suggested", "Suggested"], ["prepare", "No package yet"], ["ready", "Package ready"], ["submitted", "Submitted"], ["shortlist", "★ Shortlist"]];
  const STAGE_LABEL = { submitted: "Submitted", started: "Started", ready: "Package ready", prepare: "No package yet" };
  let tab = null, onMyFuture = false, bridge = null;
  let filter = "active", items = [], docs = null, counts = {}, openPrepare = "", armedUntil = 0, hiddenCount = 0, letterFiles = {};

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
    const data = await chrome.storage.local.get({ mstApps: {}, jobTracker: {}, mfBoard: {}, mstHidden: [], mfDocs: null, mfSyncedAt: "", mfCounts: {}, mstSuggested: {}, mstLetterFiles: {} });
    letterFiles = data.mstLetterFiles;
    docs = data.mfDocs;
    counts = data.mfCounts;
    hiddenCount = data.mstHidden.length;
    const byId = new Map();
    const get = (id) => { if (!byId.has(id)) byId.set(id, { postingId: id }); return byId.get(id); };
    for (const row of Object.values(data.mfBoard)) {
      if (!row.shortlisted && !row.appStatus) continue;
      Object.assign(get(row.id), { board: row.board, title: row.title, organization: row.organization, deadlineText: row.deadlineText });
    }
    for (const sug of Object.values(data.mstSuggested)) {
      Object.assign(get(sug.postingId), { board: sug.board, title: sug.title, organization: sug.organization, deadlineText: sug.deadlineText || sug.deadline,
        suggested: true, reason: sug.reason, suggestedBy: sug.by, appStatus: sug.appStatus || "" });
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
  const matches = (i, key) => key === "active" ? i.stage !== "submitted" : key === "suggested" ? i.suggested && i.stage !== "submitted" : key === "shortlist" ? i.shortlisted && i.stage !== "submitted" : key === "prepare" ? ["prepare", "started"].includes(i.stage) && !i.packageStatus : i.stage === key;

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
    noteEl.replaceChildren(totalShortlist > openShortlist
      ? `Your myFuture shortlist has ${totalShortlist} postings; ${totalShortlist - openShortlist} of them are closed (deadline passed), so they're not listed here. ` : "");
    if (hiddenCount) {
      const unhide = el("button", { type: "button", className: "link", textContent: `Show hidden (${hiddenCount})` });
      unhide.addEventListener("click", () => run(unhide, { type: "BRIDGE_UNHIDE" }, "…"));
      noteEl.append(unhide);
    }
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
    if (letterFiles[item.postingId]) act("View letter", "link", (b) => run(b, { type: "BRIDGE_VIEW_LETTER", postingId: item.postingId }, "Opening…"), "Open the cover letter used in this package");
    act("Open", "link", (b) => run(b, { type: "BRIDGE_OPEN_POSTING", item: ref }, "Opening…"), "Open the posting in a new tab");
    // Shortlisted postings leave the list with ★ (unshortlist on myFuture), so the list and myFuture never disagree.
    if (!item.shortlisted) act("Hide", "link", (b) => run(b, { type: "BRIDGE_FORGET", postingId: item.postingId }, "Hiding…"), "Hide from this list (doesn't change myFuture)");

    const chips = el("div", { className: "steps" },
      chip(STAGE_LABEL[item.stage], { submitted: "ok", ready: "ok", started: "warn" }[item.stage] || ""),
      item.shortlisted ? chip("★ Shortlisted") : null,
      item.letterName ? chip(`Letter ${item.letter === "done" ? "✓" : "○"}`, item.letter === "done" ? "ok" : "") : null,
      item.suggested ? chip(item.suggestedBy === "claude" ? "Suggested by Claude" : "Suggested") : null,
      item.fromClaude ? chip("From Claude") : null);
    return el("div", { className: `app-row${item.stage === "submitted" ? " applied" : ""}` },
      el("div", { className: "app-main" },
        el("strong", { textContent: `${item.organization || "Posting"} — ${item.title || item.postingId}` }),
        el("span", { className: "app-meta", textContent: [item.deadlineText && `deadline ${item.deadlineText}`, item.package && `package ${item.package}`].filter(Boolean).join(" · ") }),
        chips,
        item.suggested && item.reason && item.stage !== "submitted" ? el("span", { className: "app-reason", textContent: item.reason }) : null,
        item.error ? el("span", { className: "app-error", textContent: item.error }) : null,
        openPrepare === item.postingId ? packageForm(item, ref) : null,
        actions));
  }

  // Per-posting form state, so choices and Claude's sentence survive list refreshes.
  const forms = new Map();

  // Best CV document for a suggestion like "en_fullstack": exact base first, then language + track words in the name.
  function pickCv(names, suggestion) {
    if (!suggestion) return { name: names[0], exact: false };
    const exact = names.find((n) => n.startsWith(`${suggestion}_`) || n === suggestion);
    if (exact) return { name: exact, exact: true };
    const [lang, track] = suggestion.split("_");
    const trackWords = { fullstack: /full.?stack|web|front|back/i, games: /game|jeu/i, normal: /normal|general|software|dev/i }[track] || /$^/;
    const langWord = lang === "fr" ? /(^|[_\s-])fr([_\s-]|$)|fran/i : /(^|[_\s-])en([_\s-]|$)|engl/i;
    const scored = names.map((n) => ({ n, score: (langWord.test(n) ? 4 : 0) + (trackWords.test(n) ? 3 : 0) })).sort((a, b) => b.score - a.score);
    return { name: scored[0]?.score ? scored[0].n : names[0], exact: false };
  }

  function packageForm(item, ref) {
    if (!docs?.cvs?.length) return el("p", { className: "app-error", textContent: "Press Sync first so the extension knows your CVs, transcripts and cover letters on myFuture." });
    if (!forms.has(item.postingId)) forms.set(item.postingId, {});
    const state = forms.get(item.postingId);
    const newest = (list) => [...list].sort().reverse();
    const select = (options, extra = []) => el("select", {}, ...extra.map(([v, t]) => el("option", { value: v, textContent: t })), ...options.map((name) => el("option", { value: name, textContent: name })));
    const cv = select(newest(docs.cvs));
    const transcript = select(newest(docs.transcripts), [["", "No transcript"]]);
    const extra = [...(lettersReady() ? [["__claude", "Write one with Claude for this posting"]] : []), ["", "No cover letter"], ["__upload", "Upload a PDF…"]];
    const letter = select(newest(docs.coverLetters), extra);
    const why = el("small", { className: "recommend", textContent: state.rec ? "" : "Reading the posting to recommend a CV…" });
    const file = el("input", { type: "file", accept: "application/pdf,.pdf", hidden: true });
    const write = el("button", { type: "button", className: "secondary", textContent: state.drafted ? "Write again" : "Write with Claude", hidden: true });
    const sentence = el("textarea", { hidden: true, rows: 4, value: state.sentence || "", placeholder: "Claude's sentence about this posting appears here; edit it if you like." });
    const hint = el("small", { hidden: true, textContent: "Claude writes the one sentence about this posting from your profile; the rest is your template. Takes ~10 s, then ~1 min to make the PDF." });
    const previewBtn = el("button", { type: "button", className: "link", textContent: "Preview the whole letter", hidden: true });
    const previewBox = el("pre", { className: "letter-preview", hidden: true });
    const filePreview = el("button", { type: "button", className: "link", textContent: "Preview this PDF", hidden: true });
    previewBtn.addEventListener("click", async () => {
      if (!previewBox.hidden) { previewBox.hidden = true; previewBtn.textContent = "Preview the whole letter"; return; }
      const reply = await send({ type: "BRIDGE_PREVIEW_LETTER", posting: state.drafted, sentence: sentence.value });
      if (!reply?.ok) { say(`Couldn't preview: ${reply?.error || "no answer"}`, true); return; }
      previewBox.textContent = reply.text;
      previewBox.hidden = false;
      previewBtn.textContent = "Hide preview";
    });
    filePreview.addEventListener("click", async () => {
      const picked = file.files[0];
      if (!picked) return;
      const bytes = new Uint8Array(await picked.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await send({ type: "BRIDGE_VIEW_FILE", file: { name: picked.name, base64: btoa(binary) } });
    });
    file.addEventListener("change", () => { filePreview.hidden = !file.files[0]; });

    const sync = () => {
      file.hidden = letter.value !== "__upload";
      write.hidden = hint.hidden = letter.value !== "__claude";
      sentence.hidden = letter.value !== "__claude" || !state.drafted;
      previewBtn.hidden = sentence.hidden;
      if (previewBtn.hidden) previewBox.hidden = true;
      filePreview.hidden = file.hidden || !file.files[0];
    };
    const remember = () => { state.cv = cv.value; state.transcript = transcript.value; state.letter = letter.value; state.sentence = sentence.value; };

    // Apply the recommendation (only for fields the student hasn't touched).
    const applyRecommendation = (rec) => {
      const pick = pickCv(newest(docs.cvs), rec.cv);
      for (const option of cv.options) option.textContent = option.value + (option.value === pick.name ? " (recommended)" : "");
      const recommended = [...cv.options].find((o) => o.value === pick.name);
      if (recommended) cv.prepend(recommended); // recommended CV first in the list
      if (!state.cv) cv.value = pick.name;
      if (!state.transcript) transcript.value = rec.documents?.transcript && docs.transcripts.length ? newest(docs.transcripts)[0] : "";
      if (!state.letter) letter.value = rec.documents?.coverLetter ? (lettersReady() ? "__claude" : "") : "";
      const needs = [rec.documents?.transcript && "a transcript", rec.documents?.coverLetter && "a cover letter"].filter(Boolean);
      why.textContent = `Recommended CV: ${rec.cv}${rec.matched?.length ? ` (matches ${rec.matched.slice(0, 5).join(", ")})` : ""}${pick.exact ? "" : " — closest name in your CVs"}. `
        + (needs.length ? `This posting asks for ${needs.join(" and ")}.` : "This posting asks only for a CV.")
        + (rec.documents?.coverLetter && !lettersReady() ? " Pick one of your cover letters below, or upload a PDF." : "");
      sync();
    };
    if (state.cv) cv.value = state.cv;
    if (state.transcript !== undefined) transcript.value = state.transcript;
    else if (docs.transcripts.length) transcript.value = newest(docs.transcripts)[0];
    if (state.letter !== undefined) letter.value = state.letter;
    if (state.rec) applyRecommendation(state.rec);
    else if (onMyFuture) {
      send({ type: "BRIDGE_RECOMMEND", item: ref }).then((reply) => {
        if (!reply?.ok) { why.textContent = "Couldn't read the posting; pick the CV yourself."; return; }
        state.rec = reply;
        applyRecommendation(reply);
      });
    }

    for (const control of [cv, transcript, letter]) control.addEventListener("change", () => { remember(); sync(); });
    sentence.addEventListener("input", remember);
    write.addEventListener("click", async () => {
      write.disabled = true; write.textContent = "Claude is writing…";
      try {
        const reply = await send({ type: "BRIDGE_DRAFT_LETTER", item: ref });
        if (!reply?.ok) { say(`Claude couldn't write it: ${reply?.error || "no answer"}`, true); return; }
        state.drafted = reply.posting;
        state.sentence = sentence.value = reply.sentence;
        say("Read Claude's sentence below, edit if needed, then press Create package.");
      } finally { write.disabled = false; write.textContent = "Write again"; sync(); }
    });
    const create = el("button", { type: "button", className: "primary", textContent: "Create package" });
    create.addEventListener("click", async () => {
      remember();
      const choice = { cv: cv.value, transcript: transcript.value, coverLetter: ["__upload", "__claude"].includes(letter.value) ? "" : letter.value };
      if (letter.value === "__claude") {
        if (!state.drafted || !sentence.value.trim()) { say("Press Write with Claude first.", true); return; }
        choice.claude = { sentence: sentence.value.trim(), posting: state.drafted };
      }
      if (letter.value === "__upload") {
        const picked = file.files[0];
        if (!picked) { say("Choose the cover letter PDF first.", true); return; }
        const bytes = new Uint8Array(await picked.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        choice.letterFile = { name: picked.name, base64: btoa(binary) };
      }
      if (await run(create, { type: "BRIDGE_PREPARE_ONE", item: ref, choice }, "Creating…")) { openPrepare = ""; forms.delete(item.postingId); }
    });
    sync();
    return el("div", { className: "prepare" },
      why,
      el("label", { textContent: "CV" }), cv,
      el("label", { textContent: "Transcript" }), transcript,
      el("label", { textContent: "Cover letter" }), letter, file, filePreview, hint, write, sentence, previewBtn, previewBox,
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

  function refreshClaude() {
    if (!bridge) return;
    const planned = items.filter((i) => i.fromClaude);
    const left = planned.filter((i) => i.stage === "prepare");
    claudePanel.hidden = !left.length; // only shown when Claude Code prepared letters that still need uploading
    claudeStatus.textContent = `Claude Code prepared ${planned.length} application(s) with tailored cover letters; ${left.length} still need their letter uploaded and their package built on myFuture.`;
    claudeRun.textContent = `Upload letters & build packages (${left.length})`;
  }

  async function initClaude() {
    bridge = await send({ type: "BRIDGE_STATUS" });
    if (!bridge?.ok) { bridge = null; return; }
    refreshClaude();
    if (onMyFuture) claudeRun.addEventListener("click", () => run(claudeRun, { type: "BRIDGE_RUN_PLAN" }, "Working…"));
    else { claudeRun.disabled = true; claudeRun.title = "Open a myFuture page first"; }
    if (bridge.letters?.claude && bridge.letters.profile) findBtn.title = "Reads every Internship / Co-op posting (~40 s); Claude then picks the best ones for your profile";
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
    if (!onMyFuture) { findBtn.disabled = true; findBtn.title = "Open a myFuture page first"; }
    findBtn.addEventListener("click", async () => {
      filter = "suggested";
      await run(findBtn, { type: "BRIDGE_FIND_MATCHES", board: "internshipscoop" }, "Finding…");
    });
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
