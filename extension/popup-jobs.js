(function () {
  "use strict";

  // Panel for the posting open in this tab: match score, suggested CV, and quick actions. Saved postings land in
  // "My postings" (popup-postings.js), where they can be prepared, shortlisted and applied to.
  const APPLICANT_KEY = "applicantName";

  const panel = document.querySelector("#jobPanel");
  const smartButton = document.querySelector("#smartSearch");
  let current = null;
  let currentTab = null;

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
    return node;
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

  function render(parsed) {
    const fit = JobTools.scorePosting(parsed);
    const postingId = parsed.fields.postingId;
    const board = boardOf(currentTab?.url);
    const statusLine = el("p", { className: "job-status" });
    const cvLine = el("p", { className: "job-note" });
    const actions = el("div", { className: "job-actions" });
    let star = null, apply = null;

    if (postingId) {
      star = el("button", { type: "button", textContent: "☆ Shortlist", title: "Add to your myFuture shortlist; it then appears in My postings" });
      star.addEventListener("click", async () => {
        star.disabled = true;
        const reply = await chrome.runtime.sendMessage({ type: "BRIDGE_SHORTLIST", tabId: currentTab.id, postingId, board });
        star.disabled = false;
        if (reply?.ok) showStatus({ shortlisted: reply.shortlisted, submitted: state.submitted, live: true });
        else { star.textContent = "Could not change the shortlist"; star.title = reply?.error || ""; }
      });
      actions.append(star);
    }
    if (parsed.apply.method === "myfuture" && postingId) {
      apply = el("button", { type: "button", className: "secondary", textContent: "Apply" });
      apply.title = "Opens myFuture's application form for this posting in a new tab";
      apply.addEventListener("click", async () => {
        apply.disabled = true;
        const reply = await chrome.runtime.sendMessage({ type: "BRIDGE_OPEN_FORMS", tabId: currentTab.id,
          items: [{ postingId, board, title: parsed.fields.title, organization: parsed.fields.organization || "" }] });
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
        copy.textContent = "Copied. Attach the files yourself.";
      });
      actions.append(copy);
    }
    if (parsed.apply.method === "website" && parsed.apply.urls[0]) {
      actions.append(el("a", { className: "button-link secondary", href: parsed.apply.urls[0], target: "_blank", rel: "noopener", textContent: "Employer site ↗" }));
    }

    // Shortlisted / submitted: what the extension knows first (instant), then confirmed live from myFuture.
    const state = { shortlisted: false, submitted: false };
    function showStatus({ shortlisted, submitted, live }) {
      Object.assign(state, { shortlisted, submitted });
      statusLine.textContent = submitted ? "✓ You already submitted an application to this posting."
        : shortlisted ? "★ This posting is on your myFuture shortlist." : live ? "Not on your shortlist yet." : "";
      statusLine.className = `job-status${submitted ? " done" : shortlisted ? " starred" : ""}`;
      if (star) {
        star.hidden = submitted;
        star.textContent = shortlisted ? "★ Shortlisted (remove)" : "☆ Shortlist";
        star.title = shortlisted ? "Remove from your myFuture shortlist" : "Add to your myFuture shortlist; it then appears in My postings";
      }
      if (apply) apply.hidden = submitted;
    }

    panel.replaceChildren(
      el("p", { className: "job-fit", textContent: `Match ${fit.score}/100${fit.hits.length ? ` · ${fit.hits.slice(0, 5).join(", ")}` : ""}${fit.excluded.length ? ` · contains "${fit.excluded[0]}"` : ""}` }),
      statusLine,
      cvLine,
      parsed.documents.coverLetter ? el("p", { className: "job-note", textContent: "This posting asks for a cover letter." }) : null,
      actions
    );
    panel.hidden = false;

    (async () => {
      const { mfBoard = {}, mstApps = {}, mfDocs = null } = await chrome.storage.local.get({ mfBoard: {}, mstApps: {}, mfDocs: null });
      // Recommended CV: the student's newest CV document for the suggested language/track, when known.
      const doc = (mfDocs?.cvs || []).filter((name) => name.startsWith(`${parsed.cv}_`) || name === parsed.cv).sort().reverse()[0];
      cvLine.textContent = `Recommended CV: ${doc || parsed.cv}${parsed.track.matched.length ? ` (matches ${parsed.track.matched.slice(0, 4).join(", ")})` : ""}`;
      if (postingId) {
        const row = mfBoard[postingId], app = mstApps[postingId];
        showStatus({ shortlisted: Boolean(row?.shortlisted), submitted: JobTools.isSubmitted(row?.appStatus) || Boolean(app?.applied), live: false });
        statusLine.textContent ||= "Checking myFuture…";
        const live = await chrome.runtime.sendMessage({ type: "BRIDGE_POSTING_STATUS", tabId: currentTab.id, postingId, board });
        if (live?.ok && live.found) showStatus({ shortlisted: live.shortlisted, submitted: live.submitted, live: true });
        else if (statusLine.textContent === "Checking myFuture…") statusLine.textContent = "";
      }
    })();
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
