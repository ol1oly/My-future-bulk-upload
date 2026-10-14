(function () {
  "use strict";

  // Popup controls for the local bridge (native/mst_bridge.py): hand myFuture work prepared by local scripts to the
  // service worker, which runs it in this signed-in tab. Shown only on myFuture.
  const panel = document.querySelector("#bridgePanel");
  const statusLine = document.querySelector("#bridgeStatus");
  const progressLine = document.querySelector("#bridgeProgress");
  const scanCoop = document.querySelector("#bridgeScanCoop");
  const scanCareer = document.querySelector("#bridgeScanCareer");
  const runButton = document.querySelector("#bridgeRun");
  const checkButton = document.querySelector("#bridgeCheck");
  let tab = null;

  async function send(message) {
    return chrome.runtime.sendMessage({ ...message, tabId: tab.id });
  }

  async function job(button, message, busyText) {
    const label = button.textContent;
    for (const b of [scanCoop, scanCareer, runButton, checkButton]) b.disabled = true;
    button.textContent = busyText;
    try {
      const reply = await send(message);
      progressLine.textContent = reply.ok ? [reply.message, reply.path && `Saved: ${reply.path}`].filter(Boolean).join(" ") : `Failed: ${reply.error}`;
    } finally {
      button.textContent = label;
      for (const b of [scanCoop, scanCareer, runButton, checkButton]) b.disabled = false;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "BRIDGE_PROGRESS" && tab && message.tabId === tab.id) progressLine.textContent = message.text;
  });

  async function init() {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/myfuture\.mcgill\.ca\//.test(tab.url || "")) return;
    panel.hidden = false;
    const status = await send({ type: "BRIDGE_STATUS" });
    if (!status?.ok) {
      statusLine.textContent = "Local bridge not installed (run native\\install_host.ps1). Smart search works without it.";
      scanCoop.disabled = scanCareer.disabled = true;
      return;
    }
    const apps = status.plan?.applications || [];
    statusLine.textContent = apps.length ? `Plan ready: ${apps.length} application(s). Check it first (saves nothing), then run it (uploads letters, builds packages; never submits).` : "Connected. No plan waiting.";
    if (apps.length) {
      checkButton.hidden = false;
      runButton.hidden = false;
      runButton.textContent = `Run plan (${apps.length})`;
      runButton.title = apps.map((app) => `${app.package || app.postingId}${app.letterName ? " + letter" : ""}`).join("\n");
    }
    scanCoop.addEventListener("click", () => job(scanCoop, { type: "BRIDGE_SCAN", board: "internshipscoop" }, "Scanning…"));
    scanCareer.addEventListener("click", () => job(scanCareer, { type: "BRIDGE_SCAN", board: "career" }, "Scanning…"));
    checkButton.addEventListener("click", () => job(checkButton, { type: "BRIDGE_CHECK_PLAN" }, "Checking…"));
    runButton.addEventListener("click", () => job(runButton, { type: "BRIDGE_RUN_PLAN" }, "Running…"));
  }

  init();
})();
