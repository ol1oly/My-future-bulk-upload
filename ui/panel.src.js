(function () {
  var DOCS_URL = "https://myfuture.mcgill.ca/myAccount/opportunities/documents.htm";
  if (location.hostname !== "myfuture.mcgill.ca") { showLink("Open your myFuture documents page, then click the bookmark there."); return; }
  if (window.__mfPanel) { window.__mfPanel.show(); return; }

  var SCRIPTS = { upload: __UPLOAD_JSON__, del: __DELETE_JSON__, packages: __PACKAGES_JSON__ };
  var BASE = location.origin + "/myAccount/opportunities/documents.htm";
  var CV = "14", TR = "15", CL = "13";
  var DATE_RE = /_\d{4}-\d{2}-\d{2}$/;

  function showLink(msg) {
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#fff;color:#191614;" +
      "border:1px solid #d9d2c8;border-top:4px solid #b01e2e;border-radius:6px;padding:14px 16px;max-width:320px;" +
      "font:14px/1.5 'Segoe UI',system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.25)";
    d.innerHTML = "<div style='margin-bottom:8px'></div><a style='color:#b01e2e;font-weight:600' href='" +
      DOCS_URL + "'>Go to myFuture documents</a>";
    d.firstChild.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 12000);
  }

  var frame;
  function ensureFrame() {
    if (!frame) {
      frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;left:-99999px;top:0;width:1280px;height:900px;border:0";
      document.body.appendChild(frame);
    }
    return frame;
  }
  function win() { return frame.contentWindow; }
  function frameLoad(trigger) {
    return new Promise(function (res, rej) {
      var f = ensureFrame();
      var t = setTimeout(function () { rej(new Error("myFuture took too long to respond.")); }, 30000);
      f.addEventListener("load", function () { clearTimeout(t); res(f.contentDocument); }, { once: true });
      trigger(f);
    });
  }
  function gotoBase() { return frameLoad(function (f) { f.src = BASE; }); }
  function runInFrame(src, varName, cfg) { win()[varName] = cfg; return Promise.resolve(win().eval(src)).then(JSON.parse); }

  function pickOverviewRow(doc, label) {
    var esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("^\\s*" + esc + "\\s*\\d+");
    return [].slice.call(doc.querySelectorAll("tr,li,div"))
      .filter(function (e) { return re.test(e.innerText || "") && e.querySelector("a,button"); })
      .sort(function (a, b) { return a.innerText.length - b.innerText.length; })[0];
  }
  async function frameToAll() {
    var doc = await gotoBase();
    var sel = [].slice.call(doc.querySelectorAll("select")).find(function (s) {
      return [].slice.call(s.options).some(function (o) { return o.text.trim() === "all"; });
    });
    if (!sel) throw new Error("You are not signed in to myFuture.");
    if (sel.value !== "0") doc = await frameLoad(function () { sel.value = "0"; sel.dispatchEvent(new (win().Event)("change", { bubbles: true })); });
    return doc;
  }
  async function listDocs(label) {
    var doc = await frameToAll();
    var row = pickOverviewRow(doc, label);
    if (!row) return [];
    doc = await frameLoad(function () { row.querySelector("a,button").click(); });
    var rows = [];
    for (var i = 0; i < 20 && !rows.length; i++) {
      rows = [].slice.call(doc.querySelectorAll("table tbody tr")).filter(function (t) { return t.querySelector("input[type=checkbox]"); });
      if (!rows.length) await new Promise(function (r) { setTimeout(r, 400); });
    }
    return rows.map(function (t) { var c = [].slice.call(t.querySelectorAll("td")).map(function (d) { return d.innerText.trim(); }); return { name: c[2], date: c[4] }; });
  }

  async function opUpload(docs, files, dryRun) {
    var doc = await gotoBase();
    var btn = [].slice.call(doc.querySelectorAll("button,a")).find(function (x) { return x.innerText.trim() === "Upload Document" && x.offsetParent; });
    if (!btn) throw new Error("You are not signed in to myFuture.");
    await frameLoad(function () { btn.click(); });
    if (!win().document.querySelector("input[name=docName]")) throw new Error("The upload form did not open.");
    return runInFrame(SCRIPTS.upload, "__MF", { docs: docs, files: files, dryRun: dryRun });
  }
  async function opDelete(label, cfg) {
    var doc = await frameToAll();
    var row = pickOverviewRow(doc, label);
    if (!row) return { kept: [], results: [] };
    await frameLoad(function () { row.querySelector("a,button").click(); });
    return runInFrame(SCRIPTS.del, "__MFD", cfg);
  }
  async function opPackages(packages, dryRun) {
    var doc = await gotoBase();
    var btn = [].slice.call(doc.querySelectorAll("button,a")).find(function (x) { return x.innerText.trim() === "Create Application Package" && x.offsetParent; });
    if (!btn) throw new Error("The Create Application Package button is missing.");
    await frameLoad(function () { btn.click(); });
    if (!win().document.querySelector("input[name=name]")) throw new Error("The package form did not open.");
    return runInFrame(SCRIPTS.packages, "__MFP", { packages: packages, dryRun: dryRun });
  }
  async function opCounts() {
    var doc = await frameToAll();
    var b = doc.body.innerText, n = function (re) { return Number((b.match(re) || [])[1]); };
    return { cvs: n(/CV\/Resume\s*(\d+)/), transcripts: n(/Unofficial Transcript\s*(\d+)/), packages: n(/Application Packages\s*(\d+)/) };
  }

  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function stem(name) { return name.replace(/\.[^.]+$/, ""); }
  function baseOf(name) { return name.replace(DATE_RE, ""); }
  function reOfBases(bases) { return "^(" + bases.map(function (b) { return b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")_\\d{4}-\\d{2}-\\d{2}$"; }

  var existing = { cvs: [], transcripts: [], packages: [] };

  function computePlan(s) {
    var suffix = s.dateSuffix ? "_" + s.date : "";
    var uploads = [], files = [], targets = [], seenBase = {};
    s.newCVs.forEach(function (f) {
      var base = stem(f.name), name = base + suffix;
      if (seenBase[base]) return; seenBase[base] = 1;
      uploads.push({ name: name, type: CV }); files.push(f);
      targets.push({ base: base, cv: name, source: "new" });
    });
    s.existingCVs.forEach(function (name) {
      var base = baseOf(name);
      if (seenBase[base]) return; seenBase[base] = 1;
      targets.push({ base: base, cv: name, source: "existing" });
    });

    var trName;
    if (s.transcript.mode === "new") { trName = stem(s.transcript.file.name) + suffix; uploads.push({ name: trName, type: TR }); files.push(s.transcript.file); }
    else { trName = s.transcript.name; }

    var coverByBase = {};
    s.covers.forEach(function (c) {
      var name = stem(c.file.name) + suffix;
      uploads.push({ name: name, type: CL }); files.push(c.file);
      if (c.base) coverByBase[c.base] = name;
    });

    var packages = targets.map(function (t) {
      return { name: t.base + suffix, cv: t.cv, transcript: trName || null, coverLetter: coverByBase[t.base] || null, base: t.base };
    });

    var pkgBases = packages.map(function (p) { return p.base; });
    var pkgNames = packages.map(function (p) { return p.name; });
    var deletes = { cvs: [], transcripts: [], packages: [] };
    if (s.deleteOld) {
      var cvBases = s.newCVs.map(function (f) { return stem(f.name); });
      deletes.cvs = existing.cvs.map(function (d) { return d.name; })
        .filter(function (n) { return cvBases.indexOf(baseOf(n)) >= 0 && pkgNames.indexOf(n) < 0 && !isCvKept(n, cvBases, suffix); });
      if (s.transcript.mode === "new") {
        var trBase = stem(s.transcript.file.name);
        deletes.transcripts = existing.transcripts.map(function (d) { return d.name; }).filter(function (n) { return baseOf(n) === trBase && n !== trName; });
      }
      deletes.packages = existing.packages.map(function (d) { return d.name; })
        .filter(function (n) { return pkgBases.indexOf(baseOf(n)) >= 0 && pkgNames.indexOf(n) < 0; });
    }
    return { suffix: suffix, uploads: uploads, files: files, packages: packages, trName: trName, deletes: deletes };
  }
  function isCvKept(name, cvBases, suffix) { return cvBases.indexOf(baseOf(name)) >= 0 && name === baseOf(name) + suffix; }

  function label(t) { return t === TR ? "transcript" : t === CL ? "cover letter" : "CV"; }
  function planText(s, plan) {
    var d = plan.deletes, delTotal = d.cvs.length + d.transcripts.length + d.packages.length;
    if (!plan.uploads.length && !plan.packages.length && !delTotal) return "Pick CVs, a transcript, or files. The plan appears here.";
    var L = [];
    var sum = [];
    if (plan.uploads.length) sum.push("upload " + plan.uploads.length);
    if (plan.packages.length) sum.push(plan.packages.length + " package" + (plan.packages.length > 1 ? "s" : ""));
    if (delTotal) sum.push("remove " + delTotal + " old");
    L.push(sum.join(" | "));

    if (plan.uploads.length) {
      L.push("");
      L.push("Upload");
      plan.uploads.forEach(function (u) { L.push("  " + u.name + "  (" + label(u.type) + ")"); });
    }
    if (plan.packages.length) {
      var trs = plan.packages.map(function (p) { return p.transcript; });
      var common = trs.every(function (t) { return t === trs[0]; }) ? trs[0] : null;
      L.push("");
      L.push("Packages (" + plan.packages.length + ")");
      if (common) L.push("  transcript: " + (common || "none"));
      plan.packages.forEach(function (p) {
        L.push("  " + p.name);
        L.push("     from " + p.cv + (common ? "" : "  + transcript " + (p.transcript || "none")) + (p.coverLetter ? "  + cover " + p.coverLetter : ""));
      });
    }
    if (delTotal) {
      L.push("");
      L.push("Remove " + delTotal + " older item(s)");
      d.cvs.forEach(function (n) { L.push("  - CV " + n); });
      d.transcripts.forEach(function (n) { L.push("  - transcript " + n); });
      d.packages.forEach(function (n) { L.push("  - package " + n); });
      L.push("  (skips anything used in a submitted application)");
    }
    return L.join("\n");
  }

  async function applyPlan(s, plan, log) {
    if (plan.uploads.length) {
      log("Uploading " + plan.uploads.length + " file(s)...");
      var up = await opUpload(plan.uploads.map(function (u, i) { return { file: plan.files[i].name, name: u.name, type: u.type }; }), plan.files, false);
      if (!up.ok) throw new Error("Upload did not finish. Nothing was deleted.");
      log("Uploaded.");
    }
    if (plan.packages.length) {
      log("Creating " + plan.packages.length + " package(s)...");
      var made = await opPackages(plan.packages.map(function (p) { return { name: p.name, cv: p.cv, transcript: p.transcript, coverLetter: p.coverLetter }; }), false);
      if (!made.ok) throw new Error("Package creation failed.");
      log("Packages created.");
    }
    var d = plan.deletes;
    if (d.cvs.length) { log("Removing old CVs..."); var r1 = await opDelete("CV/Resume", { type: "CV/Resume", deleteNames: d.cvs }); report(log, r1); }
    if (d.transcripts.length) { log("Removing old transcripts..."); var r2 = await opDelete("Unofficial Transcript", { type: "Unofficial Transcript", deleteNames: d.transcripts }); report(log, r2); }
    if (d.packages.length) { log("Removing old packages..."); var r3 = await opDelete("Application Packages", { type: "Package", deleteNames: d.packages }); report(log, r3); }
    var after = await opCounts();
    log("Now on myFuture: " + after.cvs + " CVs, " + after.transcripts + " transcripts, " + after.packages + " packages.");
  }
  function report(log, res) {
    (res.results || []).forEach(function (r) { if (String(r.status).indexOf("in-use") === 0) log("  kept (in an application): " + r.name); });
  }

  var host = document.createElement("div");
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  root.innerHTML =
    "<style>" +
    ":host,*{box-sizing:border-box}" +
    ".wrap{position:fixed;right:20px;bottom:20px;width:420px;max-width:calc(100vw - 32px);max-height:86vh;display:flex;flex-direction:column;" +
    "background:#faf8f5;color:#191614;border:1px solid #d9d2c8;border-top:4px solid #b01e2e;border-radius:6px;" +
    "box-shadow:0 14px 40px rgba(0,0,0,.28);font:14px/1.45 'Segoe UI',system-ui,sans-serif;z-index:2147483647}" +
    "header{display:flex;align-items:center;gap:8px;padding:12px 14px 8px}" +
    "header b{font-size:15px}header .x{margin-left:auto;cursor:pointer;color:#8a8178;font-size:16px}" +
    ".body{padding:2px 14px 12px;overflow:auto}" +
    "h4{margin:14px 0 5px;font-size:12px;color:#514b44;font-weight:600}" +
    ".cvrow{display:flex;align-items:center;gap:7px;font-size:13px;margin:2px 0}" +
    ".cvrow small{color:#8a8178}" +
    "input[type=file]{width:100%;font-size:12px;margin-top:4px}" +
    "select{width:100%;font-size:13px;padding:3px}" +
    ".cl{margin:6px 0;padding:7px;border:1px solid #e6e0d6;border-radius:5px}" +
    ".cl div{font-size:12px;margin-bottom:3px;word-break:break-all}" +
    ".opt{display:flex;align-items:center;gap:7px;font-size:13px;margin:6px 0}" +
    ".run{display:flex;gap:8px;margin-top:12px}" +
    "button.go{flex:1;border:0;border-radius:4px;padding:9px;font:600 13px 'Segoe UI';cursor:pointer}" +
    "button.prev{background:#eceae6;color:#191614}button.apply{background:#b01e2e;color:#fff}" +
    "button:disabled{opacity:.5;cursor:default}" +
    "pre{margin:12px 0 0;padding:10px;background:#12100e;color:#e8e4de;border-radius:4px;font:11.5px/1.55 Consolas,monospace;" +
    "white-space:pre;max-height:40vh;overflow:auto}" +
    "</style>" +
    "<div class='wrap'><header><b>myFuture bulk</b><span class='x' data-x>close</span></header>" +
    "<div class='body'>" +
    "<div data-loading>Reading your documents...</div>" +
    "<div data-ui style='display:none'>" +
    "<h4>Application packages: one per CV below</h4><div data-cvlist></div>" +
    "<input type='file' accept='application/pdf' multiple data-cvs><small style='color:#8a8178'>Add new CVs (PDF)</small>" +
    "<h4>Transcript</h4><select data-trsel></select><div data-trnew style='display:none'><input type='file' accept='application/pdf' data-tr></div>" +
    "<h4>Cover letters (optional)</h4><input type='file' accept='application/pdf' multiple data-cls><div data-clrows></div>" +
    "<label class='opt'><input type='checkbox' data-date checked> Add today's date to uploaded names</label>" +
    "<label class='opt'><input type='checkbox' data-del checked> Delete older dated copies of what I upload</label>" +
    "<div class='run'><button class='go apply' data-apply>Apply changes</button></div>" +
    "</div><pre data-log>Pick CVs, a transcript, or files. The plan appears here and updates as you choose.</pre>" +
    "</div></div>";

  var $ = function (q) { return root.querySelector(q); };
  var logEl = $("[data-log]"), busy = false;
  function log(line) { logEl.textContent += "\n" + line; logEl.scrollTop = logEl.scrollHeight; }
  function setBusy(b) { busy = b; var a = $("[data-apply]"); if (a) a.disabled = b; }

  function packageBases() {
    var bases = [], seen = {};
    [].slice.call($("[data-cvs]").files).forEach(function (f) { var b = stem(f.name); if (!seen[b]) { seen[b] = 1; bases.push(b); } });
    [].slice.call(root.querySelectorAll("[data-cvpick]:checked")).forEach(function (c) { var b = baseOf(c.value); if (!seen[b]) { seen[b] = 1; bases.push(b); } });
    return bases;
  }
  function renderCoverRows() {
    var wrap = $("[data-clrows]"), bases = packageBases();
    wrap.innerHTML = "";
    [].slice.call($("[data-cls]").files).forEach(function (f, i) {
      var row = document.createElement("div"); row.className = "cl";
      var name = document.createElement("div"); name.textContent = f.name; row.appendChild(name);
      var sel = document.createElement("select"); sel.setAttribute("data-clsel", i);
      sel.innerHTML = "<option value=''>attach to: (none)</option>" + bases.map(function (b) { return "<option value='" + b + "'>attach to: " + b + "</option>"; }).join("");
      var guess = bases.find(function (b) { return stem(f.name).toLowerCase().indexOf(b.toLowerCase()) >= 0; });
      if (guess) sel.value = guess;
      row.appendChild(sel); wrap.appendChild(row);
    });
  }

  function gather() {
    var covers = [].slice.call($("[data-cls]").files).map(function (f, i) {
      var sel = root.querySelector("[data-clsel='" + i + "']");
      return { file: f, base: sel ? sel.value : "" };
    });
    var trsel = $("[data-trsel]"), transcript;
    if (trsel.value === "__new__") transcript = { mode: "new", file: $("[data-tr]").files[0] || null };
    else transcript = { mode: "existing", name: trsel.value };
    return {
      date: today(), dateSuffix: $("[data-date]").checked,
      newCVs: [].slice.call($("[data-cvs]").files),
      existingCVs: [].slice.call(root.querySelectorAll("[data-cvpick]:checked")).map(function (c) { return c.value; }),
      transcript: transcript, covers: covers, deleteOld: $("[data-del]").checked
    };
  }
  function validate(s) {
    if (!s.newCVs.length && !s.existingCVs.length) return "Pick at least one CV (existing or new).";
    if (s.transcript.mode === "new" && !s.transcript.file) return "Choose a transcript PDF, or pick an existing one.";
    if (!s.transcript.name && s.transcript.mode === "existing") return "There is no transcript on myFuture yet. Upload one.";
    return null;
  }

  function preview() {
    if (busy) return;
    var s = gather(), err = validate(s);
    logEl.textContent = err ? err : planText(s, computePlan(s));
  }
  function apply() {
    if (busy) return;
    var s = gather(), err = validate(s);
    if (err) { logEl.textContent = err; return; }
    var plan = computePlan(s);
    if (!confirm("Apply these changes to your myFuture account?")) return;
    logEl.textContent = "Working...";
    setBusy(true);
    applyPlan(s, plan, log).then(function () { log("\nDone."); }).catch(function (e) { log("\nStopped: " + (e && e.message ? e.message : e)); }).then(function () { setBusy(false); });
  }

  async function init() {
    try {
      existing.cvs = await listDocs("CV/Resume");
      existing.transcripts = await listDocs("Unofficial Transcript");
      existing.packages = await listDocs("Application Packages");
    } catch (e) {
      $("[data-loading]").innerHTML = "Could not read your documents. <a style='color:#b01e2e' href='" + DOCS_URL + "'>Open the documents page</a> and try again.";
      return;
    }
    var cvHtml = existing.cvs.map(function (d) {
      return "<label class='cvrow'><input type='checkbox' data-cvpick value=\"" + d.name.replace(/"/g, "&quot;") + "\" checked> " + d.name + " <small>" + (d.date || "") + "</small></label>";
    }).join("") || "<small style='color:#8a8178'>No CVs yet - add some below.</small>";
    $("[data-cvlist]").innerHTML = cvHtml;
    var trOpts = existing.transcripts.map(function (d) { return "<option value=\"" + d.name.replace(/"/g, "&quot;") + "\">" + d.name + "</option>"; }).join("");
    $("[data-trsel]").innerHTML = trOpts + "<option value='__new__'>Upload a new transcript...</option>";
    $("[data-loading]").style.display = "none";
    $("[data-ui]").style.display = "";

    root.addEventListener("change", function (e) {
      var t = e.target;
      if (t === $("[data-cvs]") || t === $("[data-cls]") || t.hasAttribute("data-cvpick")) renderCoverRows();
      $("[data-trnew]").style.display = $("[data-trsel]").value === "__new__" ? "" : "none";
      preview();
    });
    $("[data-apply]").onclick = apply;
    preview();
  }
  $("[data-x]").onclick = function () { host.style.display = "none"; };
  window.__mfPanel = { show: function () { host.style.display = ""; } };
  init();
})();
