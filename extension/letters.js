// Mass cover letters: draft (Claude, one posting at a time) → review/edit → build packages (one at a time).
// Drafts and progress live in chrome.storage.local ("mstBatch"), so closing this tab and coming back resumes.
(() => {
  "use strict";
  const $ = (sel) => document.querySelector(sel);
  const listEl = $("#list"), statusEl = $("#status"), writeBtn = $("#write"), makeBtn = $("#make"), buildBtn = $("#build");
  const pdfCurrent = (b) => Boolean(b?.pdf && b.pdfText === b.text);
  let myFutureTab = null, docs = null, postings = [], batch = {};

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  };
  const say = (text, bad = false) => { statusEl.textContent = text; statusEl.className = `status${bad ? " bad" : ""}`; };
  const send = (message) => chrome.runtime.sendMessage({ ...message, tabId: myFutureTab?.id });
  const saveBatch = () => chrome.storage.local.set({ mstBatch: batch });
  const newest = (list) => [...(list || [])].sort().reverse();

  // Same sources as My postings: shortlist, suggestions, saved postings and planned applications without a package.
  async function load() {
    const data = await chrome.storage.local.get({ mstApps: {}, jobTracker: {}, mfBoard: {}, mstHidden: [], mstSuggested: {}, mfDocs: null, mstBatch: {} });
    docs = data.mfDocs;
    batch = data.mstBatch;
    const byId = new Map();
    const add = (id, info) => byId.set(id, { ...(byId.get(id) || { postingId: id }), ...Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined && v !== "")) });
    for (const row of Object.values(data.mfBoard)) if (row.shortlisted) add(row.id, { board: row.board, title: row.title, organization: row.organization, deadlineText: row.deadlineText, appStatus: row.appStatus });
    for (const s of Object.values(data.mstSuggested)) add(s.postingId, { board: s.board, title: s.title, organization: s.organization, deadlineText: s.deadlineText });
    for (const c of Object.values(data.jobTracker)) if (c.postingId) add(c.postingId, { board: c.board, title: c.title, organization: c.organization });
    for (const a of Object.values(data.mstApps)) add(a.postingId, { board: a.board, title: a.title, organization: a.organization, packageStatus: a.packageStatus, applied: a.applied });
    postings = [...byId.values()].filter((p) => !data.mstHidden.includes(p.postingId) && p.packageStatus !== "done" && !p.applied
      && !JobTools.isSubmitted(data.mfBoard[p.postingId]?.appStatus));
    render();
  }

  function render() {
    if (!postings.length) {
      listEl.replaceChildren(el("p", { className: "note", textContent: "No active posting without a package. Shortlist postings or use Find matches first." }));
      return;
    }
    listEl.replaceChildren(...postings.map(card));
    const active = postings.filter((p) => batch[p.postingId]?.text && batch[p.postingId].status !== "built" && batch[p.postingId].include !== false);
    makeBtn.textContent = `2. Make PDFs (${active.filter((p) => !pdfCurrent(batch[p.postingId])).length})`;
    buildBtn.textContent = `3. Upload & build packages (${active.length})`;
  }

  function card(p) {
    const b = batch[p.postingId] || {};
    const include = el("input", { type: "checkbox", checked: b.include !== false });
    include.addEventListener("change", () => { batch[p.postingId] = { ...(batch[p.postingId] || {}), include: include.checked }; saveBatch(); render(); });
    const cv = el("select");
    const pick = JobTools.pickCv(newest(docs?.cvs), b.recommendedCv || "");
    const cvs = newest(docs?.cvs);
    const ordered = pick.name ? [pick.name, ...cvs.filter((n) => n !== pick.name)] : cvs;
    for (const name of ordered) cv.append(el("option", { value: name, textContent: name + (name === pick.name && b.recommendedCv ? " (recommended)" : ""), selected: name === (b.cv || pick.name) }));
    cv.addEventListener("change", () => { batch[p.postingId].cv = cv.value; saveBatch(); });
    const transcript = el("select", {}, el("option", { value: "", textContent: "No transcript" }), ...newest(docs?.transcripts).map((n) => el("option", { value: n, textContent: n })));
    transcript.value = b.transcript ?? (b.documents?.transcript ? newest(docs?.transcripts)[0] || "" : "");
    transcript.addEventListener("change", () => { batch[p.postingId].transcript = transcript.value; saveBatch(); });
    const text = el("textarea", { rows: b.style === "free" ? 12 : 4, value: b.text || "", placeholder: "Press Write letters above." });
    text.addEventListener("input", () => { batch[p.postingId] = { ...(batch[p.postingId] || {}), text: text.value }; saveBatch(); viewBtn.hidden = !pdfCurrent(batch[p.postingId]); });
    const change = el("input", { type: "text", placeholder: "What to change (optional), e.g. shorter, mention my game projects" });
    const rewrite = el("button", { type: "button", className: "secondary", textContent: b.text ? "Rewrite" : "Write", disabled: !myFutureTab });
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
      preview.textContent = reply?.ok ? reply.text : `Couldn't preview: ${reply?.error || "no answer"}`;
      preview.hidden = false;
    });
    const state = b.status === "built" ? el("span", { className: "state ok", textContent: `Package ${b.packageName} ready` })
      : b.pdfError && !pdfCurrent(b) ? el("span", { className: "state bad", textContent: `PDF: ${b.pdfError}` })
      : b.status === "error" ? el("span", { className: "state bad", textContent: b.error })
      : b.documents && !b.documents.coverLetter ? el("span", { className: "state", textContent: "This posting doesn't ask for a cover letter (one is still allowed)." }) : null;
    return el("div", { className: `card${b.status === "built" ? " done" : ""}` },
      el("div", { className: "head" }, include,
        el("div", {}, el("strong", { textContent: `${p.organization || "Posting"}: ${p.title || p.postingId}` }),
          el("div", { className: "meta", textContent: p.deadlineText ? `deadline ${p.deadlineText}` : "" }))),
      el("div", { className: "fields" }, cv, transcript),
      text,
      b.issues?.length ? el("div", { className: "issues", textContent: `Check: ${b.issues.join("; ")}` }) : null,
      el("div", { className: "tools" }, change, rewrite, previewBtn, viewBtn), preview, state);
  }

  async function writeOne(p, feedback = "", previous = "") {
    const reply = await send({ type: "BRIDGE_DRAFT_LETTER", item: { postingId: p.postingId, board: p.board || "internshipscoop", title: p.title, organization: p.organization }, feedback, previous });
    batch[p.postingId] = reply?.ok
      ? { ...(batch[p.postingId] || {}), text: reply.text, style: reply.style, issues: reply.issues, posting: reply.posting, recommendedCv: reply.cv, documents: reply.documents, status: "drafted", pdf: "", pdfError: "" }
      : { ...(batch[p.postingId] || {}), status: "error", error: reply?.error || "no answer" };
    await saveBatch();
  }

  async function makeAll() {
    const targets = postings.filter((p) => batch[p.postingId]?.text && batch[p.postingId].include !== false && batch[p.postingId].status !== "built" && !pdfCurrent(batch[p.postingId]));
    if (!targets.length) { say("Every selected letter already has an up-to-date PDF."); return; }
    lock(true);
    try {
      say(`Making ${targets.length} PDF(s) with Word…`);
      const reply = await send({ type: "BRIDGE_MAKE_LETTERS", items: targets.map((p) => ({ postingId: p.postingId, posting: batch[p.postingId].posting, text: batch[p.postingId].text })) });
      if (!reply?.ok) { say(`Stopped: ${reply?.error || "no answer"}`, true); return; }
      for (const r of reply.results) {
        const b = batch[r.postingId];
        if (!b) continue;
        if (r.ok) Object.assign(b, { pdf: r.pdf, pdfText: b.text, pdfError: "" }); else Object.assign(b, { pdf: "", pdfError: r.error || "failed" });
      }
      await saveBatch();
      render();
      say(reply.message);
    } finally { lock(false); }
  }

  function lock(on) { writeBtn.disabled = makeBtn.disabled = buildBtn.disabled = on || !myFutureTab; }

  async function writeAll() {
    const targets = postings.filter((p) => (batch[p.postingId]?.include !== false) && !batch[p.postingId]?.text);
    if (!targets.length) { say("Every selected posting already has a draft. Edit them, or clear a text box to rewrite it."); return; }
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
    const targets = postings.filter((p) => batch[p.postingId]?.text && batch[p.postingId].include !== false && batch[p.postingId].status !== "built");
    if (!targets.length) { say("Nothing to build: write letters first."); return; }
    lock(true);
    try {
      for (const [i, p] of targets.entries()) {
        const b = batch[p.postingId];
        const cv = b.cv || JobTools.pickCv(newest(docs?.cvs), b.recommendedCv || "").name;
        const transcript = b.transcript ?? (b.documents?.transcript ? newest(docs?.transcripts)[0] || "" : "");
        say(`Uploading ${i + 1} of ${targets.length}: ${p.organization} (${pdfCurrent(b) ? "your PDF" : "making the PDF first"}, then the package)…`);
        const reply = await send({ type: "BRIDGE_PREPARE_ONE", item: { postingId: p.postingId, board: p.board || "internshipscoop", title: p.title, organization: p.organization },
          choice: { cv, transcript, coverLetter: "", claude: { text: b.text, posting: b.posting, pdf: pdfCurrent(b) ? b.pdf : "" } } });
        batch[p.postingId] = reply?.ok ? { ...b, status: "built", packageName: reply.packageName } : { ...b, status: "error", error: reply?.error || "no answer" };
        await saveBatch();
        render();
        if (!reply?.ok && /signed in|logged out|login/i.test(reply?.error || "")) { say("myFuture signed you out. Sign in again, then press Build packages to continue.", true); return; }
      }
      say("Done. Apply from My postings (Apply to all with a package).");
    } finally { lock(false); }
  }

  async function init() {
    $("#settings").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    [myFutureTab] = await chrome.tabs.query({ url: "https://myfuture.mcgill.ca/*" });
    if (!myFutureTab) say("Open myFuture in another tab (signed in) and reload this page.", true);
    lock(false);
    writeBtn.addEventListener("click", writeAll);
    makeBtn.addEventListener("click", makeAll);
    buildBtn.addEventListener("click", buildAll);
    await load();
  }

  init();
})();
