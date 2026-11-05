// Packages for all: per posting a CV (chosen or tailored), a transcript and an optional cover letter (Claude drafts,
// student reviews/edits, Word makes the PDF) → one myFuture package each. Postings applied for outside myFuture
// (employer's site, email) never get a package; they can be hidden altogether.
// Drafts and progress live in chrome.storage.local ("mstBatch"), so closing this tab and coming back resumes.
(() => {
  "use strict";
  const $ = (sel) => document.querySelector(sel);
  const listEl = $("#list"), statusEl = $("#status"), writeBtn = $("#write"), writeAllBtn = $("#writeAll"), makeBtn = $("#make"), buildBtn = $("#build"), tailorAllBtn = $("#tailorAll");
  const skipExternalBox = $("#skipExternal"), skippedEl = $("#skipped");
  const { letterText } = JobTools;
  const pdfCurrent = (b) => Boolean(b?.pdf && b.pdfText === b.text);
  let myFutureTab = null, docs = null, all = [], postings = [], batch = {}, busy = false, cvBuilder = false, lettersReady = false, skipExternal = true;
  const SKIP_KEY = "mstBatchSkipExternal"; // hide postings applied for outside myFuture (default on)
  const TAILORED = "__tailored"; // CV choice: a CV built for this posting by the optional CV builder

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  };
  const say = (text, bad = false) => { statusEl.textContent = text; statusEl.className = `status${bad ? " bad" : ""}`; };
  const send = (message) => chrome.runtime.sendMessage({ ...message, tabId: myFutureTab?.id });
  const saveBatch = () => chrome.storage.local.set({ mstBatch: batch });
  const newest = (list) => JobTools.newestDocs(list, docs?.uploaded);
  const entry = (id) => (batch[id] ||= {});
  const itemOf = (p) => ({ postingId: p.postingId, board: p.board || "internshipscoop", title: p.title, organization: p.organization });

  // Same sources as My postings: shortlist, suggestions, saved postings and planned applications without a package.
  async function load() {
    const data = await chrome.storage.local.get({ mstApps: {}, jobTracker: {}, mfBoard: {}, mstHidden: [], mstSuggested: {}, mfDocs: null, mstBatch: {}, mfLastScan: [], mstApply: {} });
    docs = data.mfDocs;
    batch = data.mstBatch;
    const byId = new Map();
    const add = (id, info) => byId.set(id, { ...(byId.get(id) || { postingId: id }), ...Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined && v !== "")) });
    for (const row of Object.values(data.mfBoard)) if (row.shortlisted) add(row.id, { board: row.board, title: row.title, organization: row.organization, deadlineText: row.deadlineText, appStatus: row.appStatus });
    for (const s of Object.values(data.mstSuggested)) add(s.postingId, { board: s.board, title: s.title, organization: s.organization, deadlineText: s.deadlineText });
    for (const c of Object.values(data.jobTracker)) if (c.postingId) add(c.postingId, { board: c.board, title: c.title, organization: c.organization });
    for (const a of Object.values(data.mstApps)) add(a.postingId, { board: a.board, title: a.title, organization: a.organization, packageStatus: a.packageStatus, applied: a.applied });
    // The last scan already knows each posting's recommended CV and required documents.
    for (const s of data.mfLastScan) if (byId.has(s.postingId)) add(s.postingId, { recommendedCv: s.cv, documents: s.documents });
    all = [...byId.values()].filter((p) => !data.mstHidden.includes(p.postingId) && p.packageStatus !== "done" && !p.applied
      && !JobTools.isSubmitted(data.mfBoard[p.postingId]?.appStatus));
    // Applied for on the employer's site or by email: letter and PDF only, never a myFuture package.
    for (const p of all) p.external = JobTools.isExternal(data.mstApply[p.postingId]?.method);
    applySkip();
    recommendMissing();
  }

  function applySkip() {
    postings = skipExternal ? all.filter((p) => !p.external) : all;
    const hidden = all.length - postings.length;
    skippedEl.textContent = hidden ? `(${hidden} hidden)` : "";
    render();
  }

  const recommendedCv = (p) => batch[p.postingId]?.recommendedCv || p.recommendedCv || "";
  const documentsOf = (p) => batch[p.postingId]?.documents || p.documents;
  const defaultTranscript = (p) => (documentsOf(p)?.transcript ? newest(docs?.transcripts)[0] || "" : "");

  // Postings the last scan didn't cover: read each one on myFuture for its recommended CV (a few seconds each).
  async function recommendMissing() {
    const missing = postings.filter((p) => !recommendedCv(p));
    if (!missing.length || !myFutureTab) return;
    for (const p of missing) {
      const reply = await send({ type: "BRIDGE_RECOMMEND", item: itemOf(p) });
      if (reply?.ok && reply.cv) Object.assign(entry(p.postingId), { recommendedCv: reply.cv, documents: batch[p.postingId]?.documents || reply.documents });
    }
    await saveBatch();
    if (!busy) render();
  }

  function render() {
    if (!postings.length) {
      listEl.replaceChildren(el("p", { className: "note", textContent: all.length
        ? "Every posting left is applied for outside myFuture. Untick \"Skip postings applied for outside myFuture\" to write their letters."
        : "No active posting without a package. Shortlist postings or use Find matches first." }));
      return;
    }
    listEl.replaceChildren(...postings.map(card));
    const open = (p) => batch[p.postingId]?.status !== "built" && batch[p.postingId]?.include !== false;
    const active = postings.filter((p) => open(p) && batch[p.postingId]?.text);
    makeBtn.textContent = `2. Make PDFs (${active.filter((p) => !pdfCurrent(batch[p.postingId])).length})`;
    buildBtn.textContent = `3. Upload & build packages (${postings.filter((p) => open(p) && !p.external).length})`;
  }

  const needsLetter = (p) => Boolean(documentsOf(p)?.coverLetter);

  function card(p) {
    const b = batch[p.postingId] || {};
    const include = el("input", { type: "checkbox", checked: b.include !== false });
    include.addEventListener("change", () => { entry(p.postingId).include = include.checked; saveBatch(); render(); });
    const cv = el("select");
    const cvs = newest(docs?.cvs);
    const pick = JobTools.pickCv(cvs, recommendedCv(p));
    const ordered = pick.name ? [pick.name, ...cvs.filter((n) => n !== pick.name)] : cvs;
    for (const name of ordered) cv.append(el("option", { value: name, textContent: name + (name === pick.name && recommendedCv(p) ? " (recommended)" : ""), selected: name === (b.cv || pick.name) }));
    if (cvBuilder) cv.append(el("option", { value: TAILORED, textContent: "Tailored CV (Claude picks projects)", selected: b.cv === TAILORED }));
    cv.addEventListener("change", () => { entry(p.postingId).cv = cv.value; saveBatch(); render(); });
    const t = b.tailored;
    const tailorBtn = el("button", { type: "button", className: "secondary", textContent: t ? "Pick again" : "Build CV", disabled: !myFutureTab || busy });
    tailorBtn.addEventListener("click", async () => {
      lock(true); // no Build packages / Tailored CVs for all while this one builds
      say(`Choosing projects for ${p.organization}…`);
      try { say((await tailorOne(p, t?.kind === "variant")) ? "CV ready." : "The CV failed; see the card.", !batch[p.postingId].tailored); }
      finally { lock(false); }
    });
    const viewCv = el("button", { type: "button", className: "link", textContent: "View CV", hidden: !t?.pdf });
    viewCv.addEventListener("click", () => send({ type: "BRIDGE_VIEW_PATH", path: t.pdf }));
    const tailorRow = b.cv === TAILORED ? el("div", { className: "tools" }, tailorBtn, viewCv,
      el("span", { className: "meta", textContent: !t ? "Claude picks 3 or 4 of your projects for this posting." : t.kind === "variant"
        ? `Your CV ${t.variant} already fits (${t.projects.join(", ")}); it will be used. Pick again builds a tailored one anyway.`
        : `Projects: ${t.projects.join(", ")}${t.warnings?.length ? ` (${t.warnings.join("; ")})` : ""}` })) : null;
    const transcript = el("select", {}, el("option", { value: "", textContent: "No transcript" }), ...newest(docs?.transcripts).map((n) => el("option", { value: n, textContent: n })));
    transcript.value = b.transcript ?? defaultTranscript(p);
    transcript.addEventListener("change", () => { entry(p.postingId).transcript = transcript.value; saveBatch(); });
    const text = el("textarea", { rows: b.style === "free" ? 12 : 6, value: b.text || "", placeholder: needsLetter(p) || !documentsOf(p)
      ? "Cover letter (optional unless the posting asks for one): press Write letters above. Template letters: the opening sentence, a blank line, then the fit paragraph."
      : "No cover letter needed: leave empty to build the package with your CV (and transcript) only." });
    text.addEventListener("input", () => { entry(p.postingId).text = text.value; saveBatch(); viewBtn.hidden = !pdfCurrent(batch[p.postingId]); });
    const change = el("input", { type: "text", placeholder: "What to change (optional), e.g. shorter, mention my game projects" });
    const rewrite = el("button", { type: "button", className: "secondary", textContent: b.text ? "Rewrite" : "Write", disabled: !myFutureTab || busy || !lettersReady,
      title: lettersReady ? "" : "Claude letters need the local bridge and Claude Code (see cover letter settings)" });
    const viewBtn = el("button", { type: "button", className: "link", textContent: "View PDF", hidden: !pdfCurrent(b) });
    viewBtn.addEventListener("click", () => send({ type: "BRIDGE_VIEW_PATH", path: batch[p.postingId].pdf }));
    rewrite.addEventListener("click", async () => {
      rewrite.disabled = true; rewrite.textContent = "Writing…";
      await writeOne(p, change.value.trim(), text.value);
      render();
    });
    change.addEventListener("keydown", (e) => { if (e.key === "Enter") rewrite.click(); });
    const preview = el("pre", { hidden: true });
    const previewBtn = el("button", { type: "button", className: "link", textContent: "Preview text", hidden: !b.text });
    previewBtn.addEventListener("click", async () => {
      if (!preview.hidden) { preview.hidden = true; return; }
      const reply = await send({ type: "BRIDGE_PREVIEW_LETTER", posting: b.posting, text: text.value });
      preview.textContent = reply?.ok ? letterText(reply) || "No preview came back." : `Couldn't preview: ${reply?.error || "no answer"}`;
      preview.hidden = false;
    });
    const state = b.status === "built" ? el("span", { className: "state ok", textContent: b.packageName ? `Package ${b.packageName} ready` : "Package ready" })
      : b.pdfError && !pdfCurrent(b) ? el("span", { className: "state bad", textContent: `PDF: ${b.pdfError}` })
      : b.status === "error" ? el("span", { className: "state bad", textContent: b.error })
      : p.external ? el("span", { className: "state", textContent: "Applied for on the employer's site: no myFuture package. Make the PDF, then upload it there (Apply in My postings opens their page)." })
      : documentsOf(p) && !needsLetter(p) ? el("span", { className: "state", textContent: "This posting doesn't ask for a cover letter (one is still allowed)." })
      : needsLetter(p) && !b.text ? el("span", { className: "state", textContent: "This posting asks for a cover letter: write one before building its package." }) : null;
    return el("div", { className: `card${b.status === "built" ? " done" : ""}` },
      el("div", { className: "head" }, include,
        el("div", {}, el("strong", { textContent: `${p.organization || "Posting"}: ${p.title || p.postingId}` }),
          el("div", { className: "meta", textContent: p.deadlineText ? `deadline ${p.deadlineText}` : "" }))),
      el("div", { className: "fields" }, cv, transcript),
      tailorRow,
      text,
      b.issues?.length ? el("div", { className: "issues", textContent: `Check: ${b.issues.join("; ")}` }) : null,
      el("div", { className: "tools" }, change, rewrite, previewBtn, viewBtn), preview, state);
  }

  async function writeOne(p, feedback = "", previous = "") {
    const reply = await send({ type: "BRIDGE_DRAFT_LETTER", item: itemOf(p), feedback, previous });
    batch[p.postingId] = reply?.ok && letterText(reply)
      ? { ...(batch[p.postingId] || {}), text: letterText(reply), style: reply.style, issues: reply.issues, posting: reply.posting, recommendedCv: reply.cv, documents: reply.documents, status: "drafted", pdf: "", pdfError: "" }
      : { ...(batch[p.postingId] || {}), status: "error", error: reply?.error || "Claude's answer came back empty; reload the extension on chrome://extensions" };
    await saveBatch();
  }

  // Build (or rebuild) one posting's tailored CV; an existing CV that already fits comes back as kind "variant".
  async function tailorOne(p, noReuse = false) {
    const reply = await send({ type: "BRIDGE_TAILOR_CV", item: itemOf(p), noReuse });
    if (reply?.ok) Object.assign(entry(p.postingId), { tailored: reply.tailored, ...(batch[p.postingId].status === "error" ? { status: "", error: "" } : {}) });
    else Object.assign(entry(p.postingId), { status: "error", error: `CV: ${reply?.error || "no answer"}` });
    await saveBatch();
    return reply?.ok;
  }

  // The CV a package uses: a chosen document, or the tailored one (built now if needed). Variant = an existing CV.
  async function cvChoice(p) {
    const b = batch[p.postingId];
    if (b.cv !== TAILORED) return { cv: b.cv || JobTools.pickCv(newest(docs?.cvs), recommendedCv(p)).name };
    if (!b.tailored && !(await tailorOne(p))) return null;
    const t = batch[p.postingId].tailored;
    if (t.kind === "variant") {
      const pick = JobTools.pickCv(newest(docs?.cvs), t.variant);
      if (pick.exact) return { cv: pick.name };
      Object.assign(entry(p.postingId), { status: "error", error: `CV ${t.variant} fits, but no myFuture document is named ${t.variant}_<date>. Press Sync, or pick a CV.` });
      await saveBatch();
      return null;
    }
    return { cv: "", tailored: { pdf: t.pdf, docName: t.docName, projects: t.projects } };
  }

  async function tailorAll() {
    // Shown external postings too: their tailored CV is uploaded by hand on the employer's site.
    const targets = postings.filter((p) => batch[p.postingId]?.include !== false && batch[p.postingId]?.status !== "built");
    if (!targets.length) { say("No selected posting left."); return; }
    lock(true);
    try {
      let failed = 0;
      for (const [i, p] of targets.entries()) {
        entry(p.postingId).cv = TAILORED;
        if (batch[p.postingId].tailored) continue;
        say(`Choosing projects ${i + 1} of ${targets.length}: ${p.organization}…`);
        if (!(await tailorOne(p))) failed += 1;
        render();
      }
      await saveBatch();
      say(failed ? `${failed} CV(s) failed; see the ones marked in red.` : "CVs ready. View any of them, then build the packages.", Boolean(failed));
    } finally { lock(false); }
  }

  async function makeAll() {
    const targets = postings.filter((p) => batch[p.postingId]?.text && batch[p.postingId].include !== false && batch[p.postingId].status !== "built" && !pdfCurrent(batch[p.postingId]));
    if (!targets.length) { say("Every selected letter already has an up-to-date PDF."); return; }
    lock(true);
    try {
      say(`Making ${targets.length} PDF(s) with Word…`);
      // The text sent to Word, not the textarea when Word answers: the student may edit while it runs.
      const sent = new Map(targets.map((p) => [p.postingId, batch[p.postingId].text]));
      const reply = await send({ type: "BRIDGE_MAKE_LETTERS", items: targets.map((p) => ({ ...itemOf(p), posting: batch[p.postingId].posting, text: sent.get(p.postingId) })) });
      if (!reply?.ok) { say(`Stopped: ${reply?.error || "no answer"}`, true); return; }
      for (const r of reply.results) {
        const b = batch[r.postingId];
        if (!b) continue;
        if (r.ok) Object.assign(b, { pdf: r.pdf, pdfText: sent.get(r.postingId), pdfError: "" }); else Object.assign(b, { pdf: "", pdfError: r.error || "failed" });
      }
      await saveBatch();
      render();
      say(reply.message);
    } finally { lock(false); }
  }

  function lock(on) {
    busy = on;
    buildBtn.disabled = tailorAllBtn.disabled = skipExternalBox.disabled = on || !myFutureTab;
    writeBtn.disabled = writeAllBtn.disabled = makeBtn.disabled = on || !myFutureTab || !lettersReady;
    render();
  }

  // all: also redraft postings that already have text (asks first, since it replaces edits).
  async function writeAll(all = false) {
    const targets = postings.filter((p) => batch[p.postingId]?.include !== false && batch[p.postingId]?.status !== "built" && (all || !batch[p.postingId]?.text));
    if (!targets.length) { say(all ? "No selected posting left to write." : "Every selected posting already has a draft. Edit them, or press Rewrite all."); return; }
    const drafted = targets.filter((p) => batch[p.postingId]?.text).length;
    if (drafted && !confirm(`Rewrite all ${targets.length} letter(s)? This replaces ${drafted} existing draft(s), including your edits.`)) return;
    lock(true);
    try {
      for (const [i, p] of targets.entries()) {
        say(`Writing ${i + 1} of ${targets.length}: ${p.organization}: ${p.title}…`);
        await writeOne(p);
        render();
      }
      say("Letters written. Edit or rewrite any of them, then press Make PDFs.");
    } finally { lock(false); }
  }

  async function buildAll() {
    // Every selected posting applied for on myFuture: CV + transcript, plus the letter when one is drafted.
    const targets = postings.filter((p) => !p.external && batch[p.postingId]?.include !== false && batch[p.postingId]?.status !== "built");
    if (!targets.length) { say(postings.some((p) => p.external) ? "Nothing to build: postings applied for outside myFuture get a PDF only (Make PDFs), no package." : "No selected posting left to build."); return; }
    lock(true);
    let skipped = 0;
    try {
      for (const [i, p] of targets.entries()) {
        const b = entry(p.postingId);
        if (needsLetter(p) && !b.text) {
          Object.assign(b, { status: "error", error: "Needs a cover letter: write one, or untick this posting." });
          skipped += 1;
          await saveBatch();
          render();
          continue;
        }
        const transcript = b.transcript ?? defaultTranscript(p);
        say(`Preparing ${i + 1} of ${targets.length}: ${p.organization}${b.cv === TAILORED && !b.tailored ? " (building the CV first)" : ""}…`);
        const cvPart = await cvChoice(p);
        if (!cvPart) { render(); continue; }
        say(`Uploading ${i + 1} of ${targets.length}: ${p.organization} (${!b.text ? "no letter" : pdfCurrent(b) ? "your PDF" : "making the PDF first"}, then the package)…`);
        const reply = await send({ type: "BRIDGE_PREPARE_ONE", item: itemOf(p),
          choice: { ...cvPart, transcript, coverLetter: "", ...(b.text ? { claude: { text: b.text, posting: b.posting, pdf: pdfCurrent(b) ? b.pdf : "" } } : {}) } });
        batch[p.postingId] = reply?.ok ? { ...b, status: "built", packageName: reply.packageName } : { ...b, status: "error", error: reply?.error || "no answer" };
        await saveBatch();
        render();
        if (!reply?.ok && /signed in|logged out|login/i.test(reply?.error || "")) { say("myFuture signed you out. Sign in again, then press Build packages to continue.", true); return; }
      }
      say(`Done${skipped ? `; ${skipped} skipped (they need a cover letter)` : ""}. Apply from My postings (Apply to all with a package).`, Boolean(skipped));
    } finally { lock(false); }
  }

  async function init() {
    $("#settings").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    [myFutureTab] = await chrome.tabs.query({ url: "https://myfuture.mcgill.ca/*" });
    if (!myFutureTab) say("Open myFuture in another tab (signed in) and reload this page.", true);
    skipExternal = (await chrome.storage.local.get({ [SKIP_KEY]: true }))[SKIP_KEY] !== false;
    skipExternalBox.checked = skipExternal;
    skipExternalBox.addEventListener("change", () => {
      skipExternal = skipExternalBox.checked;
      chrome.storage.local.set({ [SKIP_KEY]: skipExternal });
      applySkip();
    });
    writeBtn.addEventListener("click", () => writeAll());
    writeAllBtn.addEventListener("click", () => writeAll(true));
    makeBtn.addEventListener("click", makeAll);
    buildBtn.addEventListener("click", buildAll);
    tailorAllBtn.addEventListener("click", tailorAll);
    const status = await chrome.runtime.sendMessage({ type: "BRIDGE_STATUS" });
    cvBuilder = Boolean(status?.cvBuilder);
    lettersReady = Boolean(status?.letters && Object.values(status.letters).every(Boolean));
    tailorAllBtn.hidden = !cvBuilder;
    lock(false);
    if (status && status.api !== JobTools.BRIDGE_API) say("The extension's background part is out of date. Open chrome://extensions and press the reload icon on myFuture Toolkit, then reopen this.", true);
    else if (myFutureTab && !lettersReady) say("Claude letters aren't set up on this computer (see cover letter settings): packages here use your CV and transcript only.");
    await load();
  }

  init();
})();
