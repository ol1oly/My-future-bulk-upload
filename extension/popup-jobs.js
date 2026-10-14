(function () {
  "use strict";

  // Panel for the posting open in this tab: match score, suggested CV, and quick actions. Saved postings land in
  // "My postings" (popup-postings.js), where they can be prepared, shortlisted and applied to.
  const APPLICANT_KEY = "applicantName";
  const TRACKER_KEY = "jobTracker";

  const panel = document.querySelector("#jobPanel");
  const smartButton = document.querySelector("#smartSearch");
  let current = null;
  let currentTab = null;

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
    return node;
  }

  async function downloadText(content, filename, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    try { await chrome.downloads.download({ url, filename, conflictAction: "overwrite", saveAs: false }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }

  async function openSmartSearch() {
    if (!currentTab) return;
    await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, world: "MAIN", files: ["lib/jobs.js", "orbis-board.js", "smart-search.js"] });
    window.close();
  }

  function boardOf(url) {
    return /\/career\//.test(url || "") ? "career" : "internshipscoop";
  }

  // myFuture posting pages title themselves "23565 - Job title".
  function attachPostingId(parsed, pageTitle) {
    for (const text of [parsed.fields.title, pageTitle]) {
      const match = String(text || "").match(/^\s*(\d{4,7})\s*[-–]\s*(.+)$/);
      if (match) {
        parsed.fields.postingId = parsed.fields.postingId || match[1];
        parsed.fields.title = match[2].trim();
        parsed.id = `p${match[1]}`;
        break;
      }
    }
    return parsed;
  }

  async function addToMyPostings(parsed, cv) {
    const { [TRACKER_KEY]: tracker = {} } = await chrome.storage.local.get({ [TRACKER_KEY]: {} });
    tracker[parsed.id] = { ...(tracker[parsed.id] || JobTools.trackerRow(parsed)), cv, board: boardOf(currentTab?.url),
      postingId: parsed.fields.postingId || "", deadline: parsed.deadline || "", savedAt: new Date().toISOString().slice(0, 10) };
    const { mstHidden = [] } = await chrome.storage.local.get({ mstHidden: [] });
    await chrome.storage.local.set({ [TRACKER_KEY]: tracker, mstHidden: mstHidden.filter((id) => `p${id}` !== parsed.id) });
    chrome.runtime.sendMessage({ type: "BRIDGE_APPS" }).catch(() => {});
  }

  function render(parsed) {
    const fit = JobTools.scorePosting(parsed);
    const cvSelect = el("select", { id: "jobCv", title: `Matched: ${parsed.track.matched.join(", ") || "nothing specific"}` },
      ...["en_normal", "en_fullstack", "en_games", "fr_normal", "fr_fullstack", "fr_games"].map((name) =>
        el("option", { value: name, textContent: name + (name === parsed.cv ? " (suggested)" : ""), selected: name === parsed.cv })));
    const actions = el("div", { className: "job-actions" });

    const add = el("button", { type: "button", textContent: "Add to My postings" });
    add.addEventListener("click", async () => {
      await addToMyPostings(parsed, cvSelect.value);
      add.textContent = "Added — see My postings below";
    });
    actions.append(add);

    if (parsed.apply.method === "myfuture" && parsed.fields.postingId) {
      const apply = el("button", { type: "button", className: "secondary", textContent: "Apply" });
      apply.title = "Opens myFuture's application form for this posting in a new tab";
      apply.addEventListener("click", async () => {
        apply.disabled = true;
        const reply = await chrome.runtime.sendMessage({ type: "BRIDGE_OPEN_FORMS", tabId: currentTab.id,
          items: [{ postingId: parsed.fields.postingId, board: boardOf(currentTab.url), title: parsed.fields.title, organization: parsed.fields.organization || "" }] });
        apply.textContent = reply?.ok ? "Form opened" : "Could not open";
        apply.title = reply?.error || "";
        apply.disabled = false;
      });
      actions.append(apply);
    }
    if (parsed.apply.method === "email") {
      const copy = el("button", { type: "button", className: "secondary", textContent: "Copy email draft" });
      copy.addEventListener("click", async () => {
        const { [APPLICANT_KEY]: applicant = "" } = await chrome.storage.local.get(APPLICANT_KEY);
        const mailto = new URL(JobTools.mailtoFor(parsed, applicant || "Your Name"));
        await navigator.clipboard.writeText(`To: ${parsed.apply.emails[0]}\nSubject: ${mailto.searchParams.get("subject")}\n\n${mailto.searchParams.get("body")}`);
        copy.textContent = "Copied — attach files yourself";
      });
      actions.append(copy);
    }
    if (parsed.apply.method === "website" && parsed.apply.urls[0]) {
      actions.append(el("a", { className: "button-link secondary", href: parsed.apply.urls[0], target: "_blank", rel: "noopener", textContent: "Employer site ↗" }));
    }
    const card = el("button", { type: "button", className: "link", textContent: "Download job card (for Claude)" });
    card.addEventListener("click", async () => {
      await downloadText(`${JSON.stringify({ schema: 1, savedAt: new Date().toISOString(), ...parsed, cv: cvSelect.value }, null, 2)}\n`,
        `job-cards/${JobTools.jobFileStem(parsed)}.json`, "application/json");
      card.textContent = "Saved to Downloads/job-cards";
    });

    panel.replaceChildren(
      el("p", { className: "job-fit", textContent: `Match ${fit.score}/100${fit.hits.length ? ` · ${fit.hits.slice(0, 5).join(", ")}` : ""}${fit.excluded.length ? ` · contains "${fit.excluded[0]}"` : ""}` }),
      el("label", { htmlFor: "jobCv", textContent: "Suggested CV" }), cvSelect,
      parsed.documents.coverLetter ? el("p", { className: "job-note", textContent: "This posting asks for a cover letter." }) : null,
      actions,
      card
    );
    panel.hidden = false;
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
      current = attachPostingId(parsed, result.title);
      render(current);
      return true;
    } catch (error) {
      return false;
    }
  }

  smartButton.addEventListener("click", openSmartSearch);
  globalThis.JobPanel = { scan, get current() { return current; } };
})();
