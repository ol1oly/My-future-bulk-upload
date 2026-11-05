(function () {
  "use strict";

  // "My postings": your myFuture shortlist, postings you saved, and applications in progress, with the next step for
  // each. Works without Claude and without the local bridge. With the bridge + Claude Code installed, "Package…" can
  // also have Claude write the cover letter for that posting.
  const $ = (sel) => document.querySelector(sel);
  const panel = $("#postingsPanel"), listEl = $("#postingsList"), countEl = $("#postingsCount"), syncedEl = $("#postingsSynced");
  const progressEl = $("#postingsProgress"), filtersEl = $("#postingsFilters"), noteEl = $("#postingsNote");
  const applyAllBtn = $("#applyAll"), syncBtn = $("#syncButton"), findBtn = $("#findMatches"), writeAllBtn = $("#writeAll");
  const claudePanel = $("#claudePanel"), claudeStatus = $("#claudeStatus"), claudeRun = $("#claudeRun");
  const FILTERS = [["active", "Active"], ["suggested", "Suggested"], ["prepare", "No package yet"], ["ready", "Package ready"], ["external", "External"], ["submitted", "Submitted"], ["shortlist", "★ Shortlist"]];
  const STAGE_LABEL = { submitted: "Submitted", started: "Started", ready: "Package ready", prepare: "No package yet", external: "External" };
  let tab = null, onMyFuture = false, bridge = null;
  let filter = "active", items = [], docs = null, counts = {}, openPrepare = "", armedUntil = 0, hiddenCount = 0, letterFiles = {}, drafts = {};

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  };
  const send = (message) => chrome.runtime.sendMessage({ ...message, tabId: tab?.id });
  const { letterText } = JobTools;
  const lettersReady = () => Boolean(bridge?.letters && Object.values(bridge.letters).every(Boolean));

  function say(text, bad = false) {
    progressEl.textContent = String(text || "").replace(/\s*Log: .*$/, "");
    progressEl.className = `apps-progress${bad ? " bad" : ""}`;
  }

  async function load() {
    const data = await chrome.storage.local.get({ mstApps: {}, jobTracker: {}, mfBoard: {}, mstHidden: [], mfDocs: null, mfSyncedAt: "", mfCounts: {}, mstSuggested: {}, mstLetterFiles: {}, mstBatch: {}, mstOpenPrepare: "", mstApply: {} });
    letterFiles = data.mstLetterFiles;
    drafts = data.mstBatch;
    if (!loaded) { openPrepare = data.mstOpenPrepare; loaded = true; }
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
      const apply = data.mstApply[item.postingId];
      item.method = apply?.method || "";
      item.external = JobTools.isExternal(item.method);
      const done = JobTools.isSubmitted(item.appStatus) || item.applied;
      item.stage = done ? "submitted" : item.external ? "external" : item.appStatus ? "started" : item.packageStatus === "done" ? "ready" : "prepare";
    }
    const order = ["ready", "started", "external", "prepare", "submitted"];
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
    const needPackage = items.filter((i) => i.stage === "prepare").length;
    writeAllBtn.hidden = !(onMyFuture && needPackage); // packages need no Claude: letters are optional there
    writeAllBtn.textContent = `Packages for all without one (${needPackage})`;
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
    if (item.external && item.stage !== "submitted") {
      // Applied for outside myFuture: no package; Apply opens the employer's page (or the posting, which names it).
      act(item.method === "email" ? "Apply by email" : "Apply on their site ↗", "primary external", (b) => run(b, { type: "BRIDGE_OPEN_FORMS", items: [ref] }, "Opening…"),
        item.method === "email" ? "Opens the posting with the address to email; no myFuture package needed" : "Opens the employer's application page; no myFuture package needed");
      act(openPrepare === item.postingId ? "Close" : "Letter…", "secondary",
        () => { setOpenPrepare(openPrepare === item.postingId ? "" : item.postingId); render(); },
        "Make a cover letter PDF to upload on their site", true);
      act("Mark applied", "secondary", (b) => run(b, { type: "BRIDGE_MARK_APPLIED", postingId: item.postingId, item: ref }, "…"),
        "myFuture can't see applications sent outside it; mark this one as done");
    } else if (item.stage !== "submitted") {
      act(item.stage === "started" ? "Continue" : "Apply", "primary", (b) => run(b, { type: "BRIDGE_OPEN_FORMS", items: [ref] }, "Opening…"),
        item.package ? `Opens myFuture's form with package ${item.package} selected` : "Opens myFuture's form; choose your documents there");
      if (item.packageStatus !== "done") act(openPrepare === item.postingId ? "Close" : "Package…", "secondary",
        () => { setOpenPrepare(openPrepare === item.postingId ? "" : item.postingId); render(); },
        "Build a package (CV, transcript, cover letter) before applying", true);
    }
    if (item.stage !== "submitted") {
      act(item.shortlisted ? "★" : "☆", "secondary icon", (b) => run(b, { type: "BRIDGE_SHORTLIST", postingId: item.postingId, board: ref.board }, "…"),
        item.shortlisted ? "Remove from your myFuture shortlist" : "Add to your myFuture shortlist", true);
    }
    if (letterFiles[item.postingId]) act("View letter", "link", (b) => run(b, { type: "BRIDGE_VIEW_LETTER", postingId: item.postingId }, "Opening…"), "Open the cover letter used in this package");
    act("Open", "link", (b) => run(b, { type: "BRIDGE_OPEN_POSTING", item: ref }, "Opening…"), "Open the posting in a new tab");
    // Shortlisted postings leave the list with ★ (unshortlist on myFuture), so the list and myFuture never disagree.
    if (!item.shortlisted) act("Hide", "link", (b) => run(b, { type: "BRIDGE_FORGET", postingId: item.postingId }, "Hiding…"), "Hide from this list (doesn't change myFuture)");

    const chips = el("div", { className: "steps" },
      chip(STAGE_LABEL[item.stage], { submitted: "ok", ready: "ok", started: "warn", external: "ext" }[item.stage] || ""),
      item.shortlisted ? chip("★ Shortlisted") : null,
      item.letterName ? chip(`Letter ${item.letter === "done" ? "✓" : "○"}`, item.letter === "done" ? "ok" : "") : null,
      item.suggested ? chip(item.suggestedBy === "claude" ? "Suggested by Claude" : "Suggested") : null,
      item.fromClaude ? chip("From Claude") : null);
    return el("div", { className: `app-row${item.stage === "submitted" ? " applied" : ""}` },
      el("div", { className: "app-main" },
        el("strong", { textContent: `${item.organization || "Posting"}: ${item.title || item.postingId}` }),
        el("span", { className: "app-meta", textContent: [item.deadlineText && `deadline ${item.deadlineText}`, item.package && `package ${item.package}`].filter(Boolean).join(" · ") }),
        chips,
        item.suggested && item.reason && item.stage !== "submitted" ? el("span", { className: "app-reason", textContent: item.reason }) : null,
        item.error ? el("span", { className: "app-error", textContent: item.error }) : null,
        openPrepare === item.postingId ? packageForm(item, ref) : null,
        actions));
  }

  // Per-posting form state, so choices and Claude's sentence survive list refreshes.
  const forms = new Map();
  let loaded = false;
  const setOpenPrepare = (id) => { openPrepare = id; chrome.storage.local.set({ mstOpenPrepare: id }); };

  // Claude drafts live in "mstBatch" (shared with letters.html), so closing the popup or reloading a page keeps them.
  async function saveDraft(id, state, extra = {}) {
    if (!state.drafted) return;
    const { mstBatch = {} } = await chrome.storage.local.get({ mstBatch: {} });
    mstBatch[id] = { ...(mstBatch[id] || {}), text: state.sentence || "", posting: state.drafted, style: state.style || mstBatch[id]?.style,
      pdf: state.pdf || "", pdfText: state.pdfText || "", cv: state.cv, transcript: state.transcript, status: "drafted", ...extra };
    drafts = mstBatch;
    await chrome.storage.local.set({ mstBatch });
  }
  const draftState = (b) => ({
    // A tailored CV built for this posting (kept until its package is built), even without a letter draft.
    ...(b?.tailored && b.status !== "built" ? { tailored: b.tailored, ...(b.cv === "__tailored" ? { cv: "__tailored" } : {}) } : {}),
    ...(b?.text && b.posting && b.status !== "built"
      ? { drafted: b.posting, sentence: b.text, style: b.style, pdf: b.pdf || "", pdfText: b.pdfText || "", letter: "__claude",
        ...(b.cv ? { cv: b.cv } : {}), ...(b.transcript !== undefined ? { transcript: b.transcript } : {}) }
      : {})
  });
  async function saveTailored(id, tailored, cvChoice) {
    const { mstBatch = {} } = await chrome.storage.local.get({ mstBatch: {} });
    mstBatch[id] = { ...(mstBatch[id] || {}), tailored, cv: cvChoice, ...(mstBatch[id]?.status === "built" ? { status: "" } : {}) };
    drafts = mstBatch;
    await chrome.storage.local.set({ mstBatch });
  }
  let cvCatalog = null; // projects the CV builder can use, per language (asked once per popup)
  async function catalogFor(lang) {
    if (!cvCatalog) {
      const reply = await send({ type: "BRIDGE_CV_CATALOG" });
      cvCatalog = reply?.ok ? reply.projects || {} : {};
    }
    return cvCatalog[lang] || [];
  }

  // Tailored CV controls: build (Claude picks the projects), see why, change the projects by hand, view the PDF.
  function tailorControls(item, ref, state, onVariant) {
    const box = el("div", { className: "tailor", hidden: true });
    const info = el("small", { className: "recommend" });
    const build = el("button", { type: "button", className: "secondary" });
    const picks = el("div", { className: "tailor-projects" });
    const rebuild = el("button", { type: "button", className: "link", textContent: "Rebuild with these projects", hidden: true });
    const view = el("button", { type: "button", className: "link", textContent: "View CV", hidden: true });
    box.append(info, build, picks, rebuild, view);
    const checked = () => [...picks.querySelectorAll("input:checked")].map((i) => i.value);
    const render = async () => {
      const t = state.tailored;
      build.textContent = !t ? "Build tailored CV" : t.kind === "variant" ? "Build a tailored CV anyway" : "Let Claude pick again";
      view.hidden = !t?.pdf;
      if (!t) { info.textContent = "Claude reads the posting and picks 3 or 4 of your projects (about 15 s). Bullets are copied from your CV files; skills come only from your list."; picks.replaceChildren(); rebuild.hidden = true; return; }
      const reason = (id) => (t.why?.[id] ? ` (${t.why[id]})` : "");
      info.textContent = (t.kind === "variant"
        ? `Your existing CV ${t.variant} already has the best projects: ${t.projects.join(", ")}. Choose it in the list above, or build a tailored one anyway.`
        : `Projects: ${t.projects.map((id) => id + reason(id)).join("; ")}.`)
        + (t.warnings?.length ? ` Note: ${t.warnings.join("; ")}.` : "");
      const options = await catalogFor(t.lang || "en");
      picks.replaceChildren(...options.map((p) => el("label", { className: "check" },
        el("input", { type: "checkbox", value: p.id, checked: t.projects.includes(p.id), onchange: () => { rebuild.hidden = false; } }),
        ` ${p.name}`)));
      rebuild.hidden = true;
    };
    async function go(opts) {
      build.disabled = rebuild.disabled = true;
      const label = build.textContent;
      build.textContent = "Building your CV…";
      try {
        const reply = await send({ type: "BRIDGE_TAILOR_CV", item: ref, ...opts });
        if (!reply?.ok) { say(`The CV builder failed: ${reply?.error || "no answer"}`, true); return; }
        state.tailored = reply.tailored;
        if (reply.tailored.kind === "variant") onVariant(reply.tailored.variant);
        await saveTailored(item.postingId, state.tailored, state.cv);
        say(reply.tailored.kind === "variant" ? `Your CV ${reply.tailored.variant} already fits this posting.` : "Tailored CV ready. View it before creating the package.");
      } finally { build.disabled = rebuild.disabled = false; build.textContent = label; await render(); }
    }
    build.addEventListener("click", () => go({ noReuse: state.tailored?.kind === "variant" }));
    rebuild.addEventListener("click", () => {
      const ids = checked();
      if (!ids.length) { say("Pick the projects first.", true); return; } // the builder checks how many are allowed
      go({ projects: ids, noReuse: true });
    });
    view.addEventListener("click", () => send({ type: "BRIDGE_VIEW_PATH", path: state.tailored.pdf }));
    return { box, render };
  }

  function packageForm(item, ref) {
    if (!docs?.cvs?.length) return el("p", { className: "app-error", textContent: "Press Sync first so the extension knows your CVs, transcripts and cover letters on myFuture." });
    if (!forms.has(item.postingId)) forms.set(item.postingId, draftState(drafts[item.postingId]));
    const state = forms.get(item.postingId);
    const newest = (list) => JobTools.newestDocs(list, docs.uploaded);
    const select = (options, extra = []) => el("select", {}, ...extra.map(([v, t]) => el("option", { value: v, textContent: t })), ...options.map((name) => el("option", { value: name, textContent: name })));
    const cv = select(newest(docs.cvs), bridge?.cvBuilder ? [["__tailored", "Tailored CV: Claude picks projects for this posting"]] : []);
    const tailor = tailorControls(item, ref, state, (variant) => {
      const pick = JobTools.pickCv(newest(docs.cvs), variant);
      if (pick.exact) { cv.value = pick.name; remember(); sync(); listFiles(); } // never a "closest name" guess
    });
    const transcript = select(newest(docs.transcripts), [["", "No transcript"]]);
    const extra = [...(lettersReady() ? [["__claude", "Write one with Claude for this posting"]] : []), ["", "No cover letter"], ["__upload", "Upload a PDF…"]];
    const letter = select(newest(docs.coverLetters), extra);
    const why = el("small", { className: "recommend", textContent: state.rec ? "" : "Reading the posting to recommend a CV…" });
    const file = el("input", { type: "file", accept: "application/pdf,.pdf", hidden: true });
    const write = el("button", { type: "button", className: "secondary", textContent: state.drafted ? "Rewrite" : "Write with Claude", hidden: true });
    const sentence = el("textarea", { hidden: true, rows: state.style === "free" ? 12 : 6, value: state.sentence || "", placeholder: "Claude's opening sentence, a blank line, then the fit paragraph appear here; edit them if you like." });
    const hint = el("small", { hidden: true, textContent: "Claude writes from your facts and your cover letter settings. It may look up the company on the web. Takes ~30 s, then ~1 min to make the PDF." });
    const previewBtn = el("button", { type: "button", className: "link", textContent: "Preview the whole letter", hidden: true });
    const previewBox = el("pre", { className: "letter-preview", hidden: true });
    const filePreview = el("button", { type: "button", className: "link", textContent: "Preview this PDF", hidden: true });
    previewBtn.addEventListener("click", async () => {
      if (!previewBox.hidden) { previewBox.hidden = true; previewBtn.textContent = "Preview the whole letter"; return; }
      const reply = await send({ type: "BRIDGE_PREVIEW_LETTER", posting: state.drafted, text: sentence.value });
      if (!reply?.ok) { say(`Couldn't preview: ${reply?.error || "no answer"}`, true); return; }
      previewBox.textContent = letterText(reply) || "No preview came back.";
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

    let showPdfButtons = () => {}; // replaced once the PDF buttons exist
    const sync = () => {
      file.hidden = letter.value !== "__upload";
      write.hidden = hint.hidden = letter.value !== "__claude";
      sentence.hidden = letter.value !== "__claude" || !state.drafted;
      previewBtn.hidden = sentence.hidden;
      if (previewBtn.hidden) previewBox.hidden = true;
      filePreview.hidden = file.hidden || !file.files[0];
      const wasHidden = tailor.box.hidden;
      tailor.box.hidden = cv.value !== "__tailored";
      if (wasHidden && !tailor.box.hidden) tailor.render();
      showPdfButtons();
    };
    const remember = () => { state.cv = cv.value; state.transcript = transcript.value; state.letter = letter.value; state.sentence = sentence.value; };

    // Apply the recommendation (only for fields the student hasn't touched).
    const applyRecommendation = (rec) => {
      const pick = JobTools.pickCv(newest(docs.cvs), rec.cv);
      for (const option of cv.options) option.textContent = option.value + (option.value === pick.name ? " (recommended)" : "");
      const recommended = [...cv.options].find((o) => o.value === pick.name);
      if (recommended) cv.prepend(recommended); // recommended CV first in the list
      if (!state.cv) cv.value = pick.name;
      if (!state.transcript) transcript.value = rec.documents?.transcript && docs.transcripts.length ? newest(docs.transcripts)[0] : "";
      if (!state.letter) letter.value = rec.documents?.coverLetter ? (lettersReady() ? "__claude" : "") : "";
      const needs = [rec.documents?.transcript && "a transcript", rec.documents?.coverLetter && "a cover letter"].filter(Boolean);
      why.textContent = `Recommended CV: ${rec.cv}${rec.matched?.length ? ` (matches ${rec.matched.slice(0, 5).join(", ")})` : ""}${pick.exact ? "" : " (closest name in your CVs)"}. `
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
        listFiles(); // defined below; runs after the form is built
      });
    }

    for (const control of [cv, transcript, letter]) control.addEventListener("change", () => { remember(); sync(); saveDraft(item.postingId, state); });
    cv.addEventListener("change", () => { if (state.tailored) saveTailored(item.postingId, state.tailored, cv.value); });
    let saveTimer = 0;
    sentence.addEventListener("input", () => { remember(); clearTimeout(saveTimer); saveTimer = setTimeout(() => saveDraft(item.postingId, state), 400); });
    // Rewrite with an optional change, make the PDF, look at it; upload only when happy.
    const change = el("input", { type: "text", hidden: true, placeholder: "What to change (optional), e.g. shorter, mention my game projects" });
    const makePdf = el("button", { type: "button", className: "secondary", textContent: "Make PDF", hidden: true });
    const viewPdf = el("button", { type: "button", className: "link", textContent: "View PDF", hidden: true });
    showPdfButtons = () => {
      const drafted = letter.value === "__claude" && Boolean(state.drafted);
      change.hidden = makePdf.hidden = !drafted;
      viewPdf.hidden = !(drafted && state.pdf && state.pdfText === sentence.value);
    };
    async function draft(feedback = "") {
      write.disabled = true; write.textContent = "Claude is writing…";
      try {
        const reply = await send({ type: "BRIDGE_DRAFT_LETTER", item: ref, feedback, previous: state.drafted ? sentence.value : "" });
        if (!reply?.ok) { say(`Claude couldn't write it: ${reply?.error || "no answer"}`, true); return; }
        if (!letterText(reply)) { say("Claude's answer came back empty. Reload the extension on chrome://extensions and try again.", true); return; }
        state.drafted = reply.posting;
        state.sentence = sentence.value = letterText(reply);
        state.style = reply.style;
        state.pdf = "";
        remember();
        await saveDraft(item.postingId, state);
        change.value = "";
        sentence.rows = reply.style === "free" ? 12 : 6;
        say(reply.issues?.length ? `Check before using: ${reply.issues.join("; ")}.` : "Read it, edit or rewrite it, then Make PDF to see the final letter.", Boolean(reply.issues?.length));
      } finally { write.disabled = false; write.textContent = "Rewrite"; sync(); showPdfButtons(); }
    }
    write.addEventListener("click", () => draft(change.value.trim()));
    change.addEventListener("keydown", (e) => { if (e.key === "Enter") draft(change.value.trim()); });
    sentence.addEventListener("input", showPdfButtons);
    makePdf.addEventListener("click", async () => {
      makePdf.disabled = true; makePdf.textContent = "Making PDF…";
      try {
        const sent = sentence.value; // the student may keep editing while Word runs
        const reply = await send({ type: "BRIDGE_MAKE_LETTERS", items: [{ ...ref, posting: state.drafted, text: sent }] });
        const result = reply?.results?.[0];
        if (!reply?.ok || !result?.ok) { say(`The PDF failed: ${result?.error || reply?.error || "no answer"}`, true); return; }
        state.pdf = result.pdf;
        state.pdfText = sent;
        await saveDraft(item.postingId, state);
        say("PDF ready. View it; rewrite if needed, or upload it.");
        await send({ type: "BRIDGE_VIEW_PATH", path: state.pdf });
      } finally { makePdf.disabled = false; makePdf.textContent = "Make PDF again"; showPdfButtons(); }
    });
    viewPdf.addEventListener("click", () => send({ type: "BRIDGE_VIEW_PATH", path: state.pdf }));
    const create = el("button", { type: "button", className: "primary", textContent: "Upload & create package", hidden: item.external });
    // External postings: nothing goes to myFuture; list what to upload on the employer's site instead.
    const external = item.external ? el("small", { className: "recommend" }) : null;
    const listFiles = () => {
      if (!external) return;
      const letterPart = letter.value === "__claude" ? "Claude's letter (Make PDF, then View PDF to save it)"
        : letter.value === "__upload" ? "the PDF you picked" : letter.value ? `cover letter ${letter.value}` : "";
      const cvPart = cv.value !== "__tailored" ? `CV ${cv.value}`
        : state.tailored?.pdf ? `your tailored CV (${state.tailored.pdf})` : "your tailored CV (build it first)";
      external.textContent = `No myFuture package for this one. On their site, upload: ${cvPart}${transcript.value ? `, transcript ${transcript.value}` : ""}${letterPart ? `, ${letterPart}` : ""} (the PDFs in your documents folder).`;
    };
    for (const control of [cv, transcript, letter]) control.addEventListener("change", listFiles);
    create.addEventListener("click", async () => {
      remember();
      const choice = { cv: cv.value, transcript: transcript.value, coverLetter: ["__upload", "__claude"].includes(letter.value) ? "" : letter.value };
      if (cv.value === "__tailored") {
        const t = state.tailored;
        if (!t?.pdf) { say("Press Build tailored CV first.", true); return; }
        if (t.kind === "variant") { say(`Choose ${t.variant} in the CV list (it already fits), or press Build a tailored CV anyway.`, true); return; }
        choice.cv = "";
        choice.tailored = { pdf: t.pdf, docName: t.docName, projects: t.projects };
      }
      if (letter.value === "__claude") {
        if (!state.drafted || !sentence.value.trim()) { say("Press Write with Claude first.", true); return; }
        // Upload exactly the PDF the student looked at, if the text hasn't changed since.
        choice.claude = { text: sentence.value.trim(), posting: state.drafted, pdf: state.pdf && state.pdfText === sentence.value ? state.pdf : "" };
      }
      if (letter.value === "__upload") {
        const picked = file.files[0];
        if (!picked) { say("Choose the cover letter PDF first.", true); return; }
        const bytes = new Uint8Array(await picked.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        choice.letterFile = { name: picked.name, base64: btoa(binary) };
      }
      if (await run(create, { type: "BRIDGE_PREPARE_ONE", item: ref, choice }, "Creating…")) { setOpenPrepare(""); forms.delete(item.postingId); await saveDraft(item.postingId, state, { status: "built" }); }
    });
    sync();
    listFiles();
    return el("div", { className: "prepare" },
      why,
      el("label", { textContent: "CV" }), cv, tailor.box,
      el("label", { textContent: "Transcript" }), transcript,
      el("label", { textContent: "Cover letter" }), letter, file, filePreview, hint, sentence, change, write, previewBtn, previewBox, makePdf, viewPdf,
      external, create);
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
    if (bridge && bridge.api !== JobTools.BRIDGE_API) say("The extension's background part is out of date. Open chrome://extensions and press the reload icon on myFuture Toolkit, then reopen this.", true);
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
    writeAllBtn.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("letters.html") }));
    $("#letterSettings").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
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
