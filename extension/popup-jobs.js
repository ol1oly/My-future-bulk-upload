(function () {
  "use strict";

  const APPLICANT_KEY = "applicantName";
  const TRACKER_KEY = "jobTracker";
  const STATUSES = ["saved", "prepared", "applied", "interview", "offer", "rejected", "skipped"];
  const CVS = ["en_normal", "en_fullstack", "en_games", "fr_normal", "fr_fullstack", "fr_games"];

  const panel = document.querySelector("#jobPanel");
  const trackerPanel = document.querySelector("#trackerPanel");
  const trackerButton = document.querySelector("#trackerToggle");
  const smartButton = document.querySelector("#smartSearch");
  let current = null;
  let currentTab = null;

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
    return node;
  }

  async function loadTracker() {
    const saved = await chrome.storage.local.get({ [TRACKER_KEY]: {} });
    return saved[TRACKER_KEY];
  }

  // Applications prepared through the local bridge (stored by bridge.js) also belong in this list.
  async function loadAll() {
    const tracker = await loadTracker();
    const { mstApps = {} } = await chrome.storage.local.get({ mstApps: {} });
    const merged = { ...tracker };
    for (const app of Object.values(mstApps)) {
      const id = `p${app.postingId}`;
      if (merged[id]) continue;
      merged[id] = { id, title: app.title, organization: app.organization, deadline: app.deadline || "", method: "myfuture",
        cv: app.cvUsed || "", status: app.applied ? "applied" : app.packageStatus === "done" ? "prepared" : "saved", fromPlan: true };
    }
    return merged;
  }

  async function updateCount() {
    trackerButton.textContent = `Saved postings (${Object.keys(await loadAll()).length})`;
  }

  async function saveTracker(tracker) {
    await chrome.storage.local.set({ [TRACKER_KEY]: tracker });
    await updateCount();
  }

  async function downloadText(content, filename, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    try { await chrome.downloads.download({ url, filename, conflictAction: "overwrite", saveAs: false }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }

  // Runs in the page: clicks myFuture's own Apply control. The student finishes and submits in myFuture.
  function clickPageApply() {
    const control = [...document.querySelectorAll("a, button, input[type=submit], input[type=button]")]
      .find((node) => node.offsetParent && /^(apply|postuler|apply now)$/i.test((node.innerText || node.value || "").trim()));
    if (!control) return false;
    control.click();
    return true;
  }

  async function openSmartSearch() {
    if (!currentTab) return;
    await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, world: "MAIN", files: ["lib/jobs.js", "orbis-board.js", "smart-search.js"] });
    window.close();
  }

  async function saveCard(parsed, cv, status, button) {
    button.disabled = true;
    try {
      const { [APPLICANT_KEY]: applicant = "" } = await chrome.storage.local.get(APPLICANT_KEY);
      const card = { schema: 1, savedAt: new Date().toISOString(), ...parsed, cv, applicant };
      await downloadText(`${JSON.stringify(card, null, 2)}\n`, `job-cards/${JobTools.jobFileStem(parsed)}.json`, "application/json");
      const tracker = await loadTracker();
      tracker[parsed.id] = { ...(tracker[parsed.id] || JobTools.trackerRow(parsed)), cv, status: tracker[parsed.id]?.status === "applied" ? "applied" : status };
      await saveTracker(tracker);
      button.textContent = "Saved to Downloads/job-cards";
    } catch (error) {
      button.textContent = "Could not save";
      button.title = error.message || String(error);
    } finally { button.disabled = false; }
  }

  function render(parsed) {
    const f = parsed.fields;
    const cvSelect = el("select", { id: "jobCv", title: `Matched: ${parsed.track.matched.join(", ") || "nothing specific"}` },
      ...CVS.map((name) => el("option", { value: name, textContent: name + (name === parsed.cv ? " (suggested)" : ""), selected: name === parsed.cv })));
    const save = el("button", { type: "button", textContent: "Save job card" });
    save.addEventListener("click", () => saveCard(parsed, cvSelect.value, parsed.documents.coverLetter ? "saved" : "prepared", save));

    const actions = el("div", { className: "job-actions" }, save);
    if (parsed.apply.method === "myfuture" && currentTab) {
      const apply = el("button", { type: "button", textContent: "Apply on myFuture" });
      apply.addEventListener("click", async () => {
        const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, world: "MAIN", func: clickPageApply });
        apply.textContent = result ? "Opened myFuture's application form" : "Use Smart search → Apply for this posting";
      });
      actions.prepend(apply);
    }
    if (parsed.apply.method === "email") {
      const copy = el("button", { type: "button", className: "secondary", textContent: "Copy email draft" });
      copy.addEventListener("click", async () => {
        const { [APPLICANT_KEY]: applicant = "" } = await chrome.storage.local.get(APPLICANT_KEY);
        const mailto = new URL(JobTools.mailtoFor(parsed, applicant || "Your Name"));
        const subject = mailto.searchParams.get("subject"), body = mailto.searchParams.get("body");
        await navigator.clipboard.writeText(`To: ${parsed.apply.emails[0]}\nSubject: ${subject}\n\n${body}`);
        copy.textContent = "Copied — attach files yourself";
      });
      actions.append(copy);
    }
    if (parsed.apply.method === "website" && parsed.apply.urls[0]) {
      actions.append(el("a", { className: "button-link secondary", href: parsed.apply.urls[0], target: "_blank", rel: "noopener", textContent: "Open apply page" }));
    }
    const markApplied = el("button", { type: "button", className: "secondary", textContent: "Mark applied" });
    markApplied.addEventListener("click", async () => {
      const tracker = await loadTracker();
      tracker[parsed.id] = { ...(tracker[parsed.id] || JobTools.trackerRow(parsed)), cv: cvSelect.value, status: "applied", appliedAt: new Date().toISOString().slice(0, 10) };
      await saveTracker(tracker);
      markApplied.textContent = "Marked applied";
    });
    actions.append(markApplied);

    const fit = JobTools.scorePosting(parsed);
    panel.replaceChildren(
      el("p", { className: "job-fit", textContent: `Match ${fit.score}/100${fit.hits.length ? ` · ${fit.hits.slice(0, 5).join(", ")}` : ""}${fit.excluded.length ? ` · contains "${fit.excluded[0]}"` : ""}` }),
      el("label", { htmlFor: "jobCv", textContent: "CV to use" }), cvSelect,
      parsed.documents.coverLetter ? el("p", { className: "job-note", textContent: `Cover letter required — template ${parsed.coverLetter.template}, "${parsed.coverLetter.slots.SALUTATION}". Save the card, then ask Claude to draft it.` }) : null,
      actions
    );
    panel.hidden = false;
  }

  async function renderTracker() {
    const tracker = await loadAll();
    const rows = Object.values(tracker).sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    const { [APPLICANT_KEY]: applicant = "" } = await chrome.storage.local.get(APPLICANT_KEY);
    const name = el("input", { id: "applicantName", value: applicant, placeholder: "Your name (for email drafts)" });
    name.addEventListener("change", () => chrome.storage.local.set({ [APPLICANT_KEY]: name.value.trim() }));
    const list = el("div", { className: "tracker-list" });
    for (const row of rows) {
      const status = el("select", { "aria-label": `Status for ${row.title}` }, ...STATUSES.map((value) => el("option", { value, textContent: value, selected: value === row.status })));
      status.addEventListener("change", async () => {
        const latest = await loadTracker();
        latest[row.id] = { ...row, ...latest[row.id], fromPlan: undefined, status: status.value, appliedAt: status.value === "applied" && !row.appliedAt ? new Date().toISOString().slice(0, 10) : latest[row.id].appliedAt };
        await saveTracker(latest);
      });
      const remove = el("button", { type: "button", className: "link", textContent: "Remove", title: "Remove from tracker" });
      remove.addEventListener("click", async () => { const latest = await loadTracker(); delete latest[row.id]; await saveTracker(latest); renderTracker(); });
      const days = JobTools.daysUntil(row.deadline);
      list.append(el("div", { className: "tracker-row" },
        el("div", { className: "track-details" },
          el("strong", { textContent: row.title || "Untitled" }),
          el("span", { textContent: [row.organization, row.deadline && `${row.deadline}${days !== null && days >= 0 ? ` (${days}d)` : ""}`, row.method, row.cv].filter(Boolean).join(" · ") })),
        status, remove));
    }
    const exportButton = el("button", { type: "button", className: "secondary", textContent: "Export CSV" });
    exportButton.addEventListener("click", async () => downloadText(JobTools.trackerCsv(Object.values(await loadTracker())), "job-cards/applications.csv", "text/csv"));
    trackerPanel.replaceChildren(el("label", { htmlFor: "applicantName", textContent: "Applicant name" }), name,
      rows.length ? list : el("div", { className: "empty", textContent: "No saved jobs yet. Open a posting and choose Save job card." }),
      rows.length ? exportButton : null);
  }

  async function scan(tab) {
    panel.hidden = true;
    current = null;
    currentTab = tab;
    smartButton.hidden = !/^https:\/\/myfuture\.mcgill\.ca\/myAccount\/.*postings\.htm/.test(tab.url || "");
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["jobs-extractor.js"] });
      const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__jobPostingCollect?.() });
      if (!result) return false;
      let parsed = JobTools.parsePosting(result.pairs, { title: result.title, url: result.url, text: result.text });
      if (!JobTools.isLikelyPosting(parsed) && result.selection.length > 200) {
        // Postings that arrive as PDFs or emails: select the text, open the popup.
        parsed = JobTools.parsePosting([], { title: result.title, url: result.url, text: result.selection });
        parsed.fields.title = parsed.fields.title || "Selected posting";
        parsed.fromSelection = true;
      } else if (!JobTools.isLikelyPosting(parsed)) return false;
      current = parsed;
      render(parsed);
      return true;
    } catch (error) {
      return false;
    }
  }

  smartButton.addEventListener("click", openSmartSearch);
  trackerButton.addEventListener("click", async () => {
    trackerPanel.hidden = !trackerPanel.hidden;
    if (!trackerPanel.hidden) await renderTracker();
  });
  updateCount();

  globalThis.JobPanel = { scan, get current() { return current; } };
})();
