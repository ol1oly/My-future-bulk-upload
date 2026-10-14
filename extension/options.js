// Cover letter settings: read/written through the local bridge, in the same files Claude Code uses.
(() => {
  "use strict";
  const HOST = "com.mcgill_student_toolkit.bridge";
  const $ = (sel) => document.querySelector(sel);
  const MODEL_NAMES = { sonnet: "Sonnet", opus: "Opus", haiku: "Haiku" };
  let updatedAt = "";

  async function host(message) {
    const reply = await chrome.runtime.sendNativeMessage(HOST, message);
    if (!reply?.ok) throw new Error(reply?.error || "the local bridge did not answer");
    return reply;
  }
  const lines = (text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const status = (el, text, bad = false) => { el.textContent = text; el.className = `status${bad ? " bad" : ""}`; };

  function fill(reply) {
    const s = reply.settings;
    updatedAt = s.updatedAt || "";
    for (const radio of document.querySelectorAll("input[name=style]")) radio.checked = radio.value === s.style;
    $("#instructions").value = s.instructions || "";
    $("#model").replaceChildren(...reply.models.map((m) => Object.assign(document.createElement("option"), { value: m, textContent: MODEL_NAMES[m] || m, selected: m === s.model })));
    $("#banned").value = (s.extraBanned || []).join("\n");
    $("#cvHistory").checked = Boolean(s.useCvHistory);
    $("#cvFolder").textContent = reply.cvFolder ? `(${reply.cvFolder})` : "(no cv folder found under your documents folder)";
    $("#paths").value = (s.paths || []).join("\n");
    $("#links").value = (s.links || []).join("\n");
    $("#digest").value = reply.digest || "";
    const missing = [!reply.support.claude && "Claude Code", !reply.support.word && "Microsoft Word (Windows)"].filter(Boolean);
    if (missing.length) {
      $("#warning").textContent = `Writing letters needs ${missing.join(" and ")} on this computer. You can still edit these settings.`;
      $("#warning").classList.add("show");
    }
  }

  async function load() {
    try {
      fill(await host({ cmd: "getLetterSettings" }));
    } catch (error) {
      $("#warning").textContent = "The local bridge isn't installed, so these settings can't be read. Cover letters by Claude need it (see the README: native\\install_host.ps1). Everything else in the extension works without it.";
      $("#warning").classList.add("show");
      for (const el of document.querySelectorAll("button, textarea, input, select")) el.disabled = true;
    }
  }

  $("#save").addEventListener("click", async () => {
    const button = $("#save");
    button.disabled = true;
    try {
      const settings = {
        style: document.querySelector("input[name=style]:checked")?.value || "template",
        instructions: $("#instructions").value,
        model: $("#model").value,
        extraBanned: lines($("#banned").value),
        useCvHistory: $("#cvHistory").checked,
        paths: lines($("#paths").value),
        links: lines($("#links").value)
      };
      const reply = await host({ cmd: "saveLetterSettings", settings, expectedUpdatedAt: updatedAt });
      fill(reply);
      status($("#saveStatus"), "Saved.");
    } catch (error) {
      status($("#saveStatus"), error.message, true);
    } finally { button.disabled = false; }
  });

  $("#refresh").addEventListener("click", async () => {
    const button = $("#refresh");
    button.disabled = true;
    status($("#refreshStatus"), "Reading your sources… (about a minute)");
    try {
      const reply = await host({ cmd: "refreshSources" });
      $("#digest").value = reply.digest;
      status($("#refreshStatus"), `Done: ${reply.files.length} file(s) read${reply.notes.length ? `. Skipped: ${reply.notes.join("; ")}` : ""}.`, reply.notes.length > 0);
    } catch (error) {
      status($("#refreshStatus"), error.message, true);
    } finally { button.disabled = false; }
  });

  $("#saveDigest").addEventListener("click", async () => {
    try {
      await host({ cmd: "saveDigest", text: $("#digest").value });
      status($("#digestStatus"), "Saved.");
    } catch (error) {
      status($("#digestStatus"), error.message, true);
    }
  });

  load();
})();
