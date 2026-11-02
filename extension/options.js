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
    $("#forbid").value = (s.forbidCompanies || []).join("\n");
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
        forbidCompanies: lines($("#forbid").value),
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

  // The picker is a Windows dialog opened by the local bridge (it may appear behind Chrome's window).
  for (const [id, kind] of [["#addFolder", "folder"], ["#addFiles", "files"]]) {
    $(id).addEventListener("click", async () => {
      const button = $(id);
      button.disabled = true;
      status($("#browseStatus"), "Pick in the window that opened…");
      try {
        const { paths } = await host({ cmd: "browsePaths", kind });
        const current = lines($("#paths").value);
        const added = paths.filter((p) => !current.some((c) => c.toLowerCase() === p.toLowerCase()));
        $("#paths").value = [...current, ...added].join("\n");
        status($("#browseStatus"), added.length ? `Added ${added.length}. Press Save settings.` : "Nothing added.");
      } catch (error) {
        status($("#browseStatus"), error.message, true);
      } finally { button.disabled = false; }
    });
  }

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

  // ---------- tailored CVs (optional CV builder): the builder describes its own fields ----------
  // Field types: number {min,max} | select {options:[[value,label]]} | checkbox | text {placeholder} | projects {choices:[{id,name}]}.
  let cvUpdatedAt = "", cvFieldList = [];
  const el = (tag, props = {}, ...children) => { const n = Object.assign(document.createElement(tag), props); n.append(...children); return n; };
  function cvField(f, value) {
    const id = `cv_${f.key}`;
    const help = f.help ? el("small", { textContent: f.help }) : "";
    if (f.type === "checkbox") return el("div", {}, el("label", { className: "inline" }, el("input", { type: "checkbox", id, checked: Boolean(value) }), el("span", { textContent: f.label })), help);
    let control;
    if (f.type === "number") control = el("input", { type: "number", id, value: value ?? "", min: f.min ?? "", max: f.max ?? "" });
    else if (f.type === "select") control = el("select", { id }, ...(f.options || []).map(([v, t]) => el("option", { value: v, textContent: t, selected: v === value })));
    else if (f.type === "projects") {
      const picked = new Set(value || []);
      control = el("div", { className: "choices", id }, ...(f.choices || []).map((c) =>
        el("label", { className: "inline" }, el("input", { type: "checkbox", value: c.id, checked: picked.has(c.id) }), el("span", { textContent: c.name }))));
    } else control = el("textarea", { id, rows: 3, value: value || "", placeholder: f.placeholder || "" });
    return el("div", {}, el("label", { htmlFor: id, textContent: f.label }), control, help);
  }
  function cvValue(f) {
    const node = document.getElementById(`cv_${f.key}`);
    if (f.type === "checkbox") return node.checked;
    if (f.type === "number") return Number(node.value);
    if (f.type === "projects") return [...node.querySelectorAll("input:checked")].map((i) => i.value);
    return node.value;
  }
  function fillCv(reply) {
    if (!reply?.available) return;
    $("#cvSection").hidden = false;
    cvUpdatedAt = reply.settings.updatedAt || "";
    cvFieldList = reply.fields || [];
    $("#cvPath").textContent = reply.path || "";
    $("#cvFields").replaceChildren(...cvFieldList.map((f) => cvField(f, reply.settings[f.key])));
  }
  async function loadCv() {
    try { fillCv(await host({ cmd: "cvSettings" })); } catch (error) {
      $("#cvSection").hidden = false;
      status($("#cvStatus"), `The CV builder's settings couldn't be read: ${error.message}`, true);
      $("#saveCv").disabled = true;
    }
  }
  $("#saveCv").addEventListener("click", async () => {
    const button = $("#saveCv");
    button.disabled = true;
    try {
      const settings = Object.fromEntries(cvFieldList.map((f) => [f.key, cvValue(f)]));
      const reply = await host({ cmd: "cvSettings", settings, expectedUpdatedAt: cvUpdatedAt });
      fillCv(reply);
      status($("#cvStatus"), "Saved.");
    } catch (error) {
      status($("#cvStatus"), error.message, true);
    } finally { button.disabled = false; }
  });

  load();
  loadCv();
})();
