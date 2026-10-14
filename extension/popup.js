(function () {
  "use strict";

  const status = document.querySelector("#status");
  const empty = document.querySelector("#empty");

  async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      status.textContent = "Open myFuture or a job posting";
      return;
    }
    const found = await JobPanel.scan(tab);
    if (found) {
      status.textContent = JobPanel.current?.fromSelection ? "Job posting read from selected text" : "Job posting found";
    } else if (!document.querySelector("#smartSearch").hidden) {
      status.textContent = "myFuture postings";
    } else if (/myfuture\.mcgill\.ca/.test(tab.url)) {
      status.textContent = "myFuture";
    } else {
      status.textContent = "No job posting on this page";
      empty.textContent = "Open a job posting, or select a posting's text (PDF or email) and reopen the extension.";
      empty.hidden = false;
    }
  }

  init();
})();
