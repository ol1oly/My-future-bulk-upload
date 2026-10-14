/*
 * Local bridge jobs (service worker). Runs work prepared by local scripts inside the student's own signed-in myFuture
 * tab, in one hidden iframe (scripts/frame-ops.js, the bookmarklet panel's method), so the visible page never moves:
 * scan a postings board, check or run an application plan (resolve newest CV/transcript, upload cover letters, build
 * packages), and open one application form for inspection. Talks to the native host
 * "com.mcgill_student_toolkit.bridge" (native/mst_bridge.py). Every job starts from a click in the popup.
 * Nothing here submits an application.
 */
(() => {
  "use strict";

  const HOST = "com.mcgill_student_toolkit.bridge";
  const BOARDS = { internshipscoop: "/myAccount/opportunities/internshipscoop/postings.htm", career: "/myAccount/opportunities/career/postings.htm" };
  const DATED = /_\d{4}-\d{2}-\d{2}$/;
  const progress = new Map(); // tabId -> latest progress line
  const APPS_KEY = "mstApps"; // postingId -> { title, organization, board, package, letterName, letter, package_, applied, error, ... }

  async function loadApps() { return (await chrome.storage.local.get({ [APPS_KEY]: {} }))[APPS_KEY]; }
  async function updateApps(mutate) {
    const apps = await loadApps();
    mutate(apps);
    await chrome.storage.local.set({ [APPS_KEY]: apps });
    chrome.runtime.sendMessage({ type: "BRIDGE_APPS" }).catch(() => {});
    return apps;
  }
  // Keep the store in step with plan.json: add new applications, keep progress of known ones.
  async function seedApps(plan) {
    return updateApps((apps) => {
      for (const app of plan?.applications || []) {
        const id = String(app.postingId);
        apps[id] = { letter: app.letterPdf ? "todo" : "none", packageStatus: "todo", applied: false, ...(apps[id] || {}),
          postingId: id, title: app.title || "", organization: app.organization || "", board: app.board || "internshipscoop",
          package: app.package, letterName: app.letterName || "", inPlan: true };
      }
    });
  }

  async function host(message) {
    const reply = await chrome.runtime.sendNativeMessage(HOST, message);
    if (!reply?.ok) throw new Error(reply?.error || "local bridge did not answer");
    return reply;
  }

  function note(tabId, text) {
    progress.set(tabId, text);
    chrome.runtime.sendMessage({ type: "BRIDGE_PROGRESS", tabId, text }).catch(() => {});
  }

  const ownFile = async (path) => (await fetch(chrome.runtime.getURL(path))).text();
  const script = async (name) => (await host({ cmd: "readScript", name })).source;

  async function inPage(tabId, func, args = []) {
    const [entry] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
    return entry?.result;
  }

  // Loads frame-ops.js into the page (once) and returns nothing; later calls use window.__mfFrame.
  async function ensureFrameOps(tabId) {
    const source = await script("frame-ops.js");
    await inPage(tabId, (src) => { if (!window.__mfFrame) (0, eval)(src); }, [source]);
  }

  // ---------- scan ----------
  async function scanBoard(tabId, board, prefs = {}) {
    if (!BOARDS[board]) throw new Error(`unknown board ${board}`);
    note(tabId, `Opening ${board} postings in the background…`);
    await ensureFrameOps(tabId);
    const engine = [await ownFile("lib/jobs.js"), await ownFile("orbis-board.js")];
    note(tabId, "Reading every posting (about 40 s)…");
    const result = await inPage(tabId, async (path, sources, prefsIn) => {
      await window.__mfFrame.openBoard(path);
      const w = window.__mfFrame.frameWindow();
      for (const src of sources) w.eval(src);
      const J = w.JobTools, board = w.__orbisBoard;
      const P = { ...J.DEFAULT_PREFS, ...(prefsIn || {}) };
      const rows = await board.listAll();
      const { details, errors } = await board.fetchDetails(rows.map((row) => row.id));
      const postings = rows.map((row) => {
        const p = J.parsePosting(details[row.id] || [], { title: row.title });
        p.id = `p${row.id}`;
        p.fields.title = p.fields.title || row.title;
        p.fields.organization = p.fields.organization || row.organization;
        p.fit = J.scorePosting(p, P);
        p.why = J.filterPosting(p, { appStatus: row.appStatus, shortlisted: row.shortlisted }, P);
        return { postingId: row.id, row, ...p };
      });
      return JSON.parse(JSON.stringify({ prefs: P, errors, postings }));
    }, [BOARDS[board], engine, prefs]);
    result.board = board;
    result.scannedAt = new Date().toISOString();
    const saved = await host({ cmd: "writeResult", name: `scan-${board}`, data: result });
    const matching = result.postings.filter((p) => !p.why).sort((a, b) => b.fit.score - a.fit.score);
    note(tabId, `Read ${result.postings.length} postings.`);
    return {
      count: result.postings.length, matching: matching.length, path: saved.path,
      top: matching.slice(0, 8).map((p) => ({ id: p.postingId, score: p.fit.score, title: p.fields.title, organization: p.fields.organization || "", mcgill: p.apply.method === "myfuture" }))
    };
  }

  // ---------- plan ----------
  function newestByBase(docs, base) {
    if (!base || DATED.test(base) || docs.some((d) => d.name === base)) return base;
    const dated = docs.map((d) => d.name).filter((name) => name.startsWith(`${base}_`) && DATED.test(name)).sort();
    if (!dated.length) throw new Error(`no document named ${base}_<date> on myFuture`);
    return dated[dated.length - 1];
  }

  async function runPlan(tabId, { dryRun = false } = {}) {
    const { plan } = await host({ cmd: "getPlan" });
    if (!plan?.applications?.length) throw new Error("plan.json has no applications");
    const apps = plan.applications.map((app) => ({ ...app }));
    await seedApps(plan);
    const log = { startedAt: new Date().toISOString(), dryRun, steps: [] };
    await ensureFrameOps(tabId);

    if (plan.resolveNewest !== false) {
      note(tabId, "Reading your current CVs and transcripts…");
      const [cvs, transcripts] = await inPage(tabId, async () => [
        await window.__mfFrame.listDocs("CV/Resume"), await window.__mfFrame.listDocs("Unofficial Transcript")]);
      for (const app of apps) {
        app.cv = newestByBase(cvs, app.cv);
        if (app.transcript) app.transcript = newestByBase(transcripts, app.transcript);
      }
      log.steps.push({ step: "resolve", result: { cvs: cvs.length, transcripts: transcripts.length, used: apps.map((a) => [a.package, a.cv, a.transcript || ""]) } });
    }

    // Idempotent: letters and packages already on myFuture are kept and counted as done, never uploaded or built twice.
    note(tabId, "Reading your cover letters and packages on myFuture…");
    const [existingLetters, existingPackages] = await inPage(tabId, async () => [
      await window.__mfFrame.listDocs("Cover Letter"), await window.__mfFrame.listDocs("Application Packages")]);
    const hasLetter = (name) => existingLetters.some((d) => d.name === name);
    const hasPackage = (name) => existingPackages.some((d) => d.name === name);
    const letters = apps.filter((app) => app.letterPdf && app.letterName && !hasLetter(app.letterName));
    const lettersThere = apps.filter((app) => app.letterName && hasLetter(app.letterName));
    let uploadResults = [];
    if (letters.length) {
      note(tabId, `${dryRun ? "Checking" : "Uploading"} ${letters.length} cover letter(s)…`);
      const files = [];
      for (const app of letters) files.push(await host({ cmd: "readFile", path: app.letterPdf }));
      const upload = await inPage(tabId, async (src, docs, fileList, dry) => {
        const files = fileList.map((file) => {
          const binary = atob(file.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          return new File([bytes], file.name, { type: "application/pdf" });
        });
        return window.__mfFrame.upload(src, docs, files, dry);
      }, [await script("upload.js"), letters.map((app, i) => ({ file: files[i].name, name: app.letterName, type: "13" })), files.map((f) => ({ name: f.name, base64: f.base64 })), dryRun]);
      uploadResults = upload?.results || [];
      log.steps.push({ step: "upload", result: { ...upload, alreadyThere: lettersThere.map((a) => a.letterName) } });
      if (!dryRun && !upload?.ok) log.problem = "Some cover letters were not uploaded; their packages were skipped.";
    } else if (lettersThere.length) {
      log.steps.push({ step: "upload", result: { ok: true, results: [], alreadyThere: lettersThere.map((a) => a.letterName) } });
    }
    const letterReady = (app) => !app.letterName || hasLetter(app.letterName) || uploadResults.some((r) => r.name === app.letterName && r.status === "saved");

    const toCreate = apps.filter((app) => app.package && app.createPackage !== false && !hasPackage(app.package) && (dryRun || letterReady(app)));
    let created = null;
    if (toCreate.length) {
      note(tabId, `${dryRun ? "Checking" : "Creating"} ${toCreate.length} application package(s)…`);
      // In a dry run new letters are not on myFuture yet, so their packages are checked without the letter.
      const list = toCreate.map((app) => ({ name: app.package, cv: app.cv, transcript: app.transcript || null,
        coverLetter: dryRun && app.letterName && !hasLetter(app.letterName) ? null : app.letterName || null }));
      created = await inPage(tabId, (src, items, dry) => window.__mfFrame.packages(src, items, dry), [await script("packages.js"), list, dryRun]);
    }
    log.steps.push({ step: "packages", result: { ...(created || { ok: true, results: [] }), alreadyExist: apps.filter((a) => a.package && hasPackage(a.package)).map((a) => a.package) } });

    await updateApps((store) => {
      for (const app of apps) {
        const entry = store[String(app.postingId)];
        if (!entry) continue;
        entry.cvUsed = app.cv; entry.transcriptUsed = app.transcript || "";
        delete entry.error;
        if (dryRun) {
          const okPkg = !toCreate.includes(app) || created?.dryRun;
          entry.checked = okPkg ? "ok" : "package problem";
          continue;
        }
        if (app.letterName) entry.letter = letterReady(app) ? "done" : "failed";
        const r = (created?.results || []).find((x) => x.name === app.package);
        if (hasPackage(app.package) || r?.status === "created") entry.packageStatus = "done";
        else if (r) entry.packageStatus = "failed";
        else if (!letterReady(app)) { entry.packageStatus = "todo"; entry.error = "Cover letter not uploaded, so the package was not built."; }
      }
    });

    if (!dryRun && plan.probeApply) {
      const target = apps.find((app) => String(app.postingId) === String(plan.probeApply)) || apps[0];
      log.steps.push({ step: "probe", result: await probeApply(tabId, target.board || "internshipscoop", target.postingId) });
    }
    return finish(tabId, log, dryRun ? "Check finished — nothing was saved." : (log.problem || "Done."));
  }

  async function finish(tabId, log, message) {
    log.finishedAt = new Date().toISOString();
    log.message = message;
    const saved = await host({ cmd: "writeResult", name: `${log.dryRun ? "check" : "run"}-${log.startedAt.replace(/[:.]/g, "-")}`, data: log });
    note(tabId, `${message} Log: ${saved.path}`);
    return { log, path: saved.path, message };
  }

  // ---------- application form (inspect only) ----------
  const PROBE = () => {
    const t = (n) => (n.innerText || n.textContent || n.value || "").replace(/\s+/g, " ").trim();
    const forms = [...document.forms].map((f) => ({
      id: f.id,
      fields: [...f.elements].filter((e) => e.name && !/^(_csrf|rand)$/.test(e.name)).map((e) => ({
        tag: e.tagName, type: e.type, name: e.name, required: e.required,
        label: t(e.closest(".control-group,.form-group,tr,label") || e).slice(0, 100),
        options: e.tagName === "SELECT" ? [...e.options].map((o) => o.text.trim()).slice(0, 60) : undefined,
        value: e.type === "hidden" ? (String(e.value).startsWith("_-_-") ? "TOKEN" : String(e.value).slice(0, 60)) : undefined
      }))
    })).filter((f) => f.fields.length);
    const buttons = [...document.querySelectorAll("a,button,input[type=submit],input[type=button]")].filter((b) => b.offsetParent).map(t).filter((s) => s && s.length < 60);
    return { path: location.pathname, title: document.title, headings: [...document.querySelectorAll("h1,h2,h3,h4,.panel-heading,legend,.alert")].map(t).filter(Boolean).slice(0, 30),
      buttons: [...new Set(buttons)], forms, text: t(document.querySelector("#mainContentDiv, main") || document.body).slice(0, 5000) };
  };

  function waitTab(tabId, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("page load timed out")); }, timeoutMs);
      function listener(id, info) {
        if (id === tabId && info.status === "complete") { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  // Opens a NEW background tab on the posting's board and turns it into myFuture's own application form for that
  // posting (same request as the Apply button). Shows a banner naming the package to choose. Never submits.
  async function openFormTab(app, { active = false } = {}) {
    const tab = await chrome.tabs.create({ url: `https://myfuture.mcgill.ca${BOARDS[app.board || "internshipscoop"]}`, active });
    await waitTab(tab.id);
    const listLoaded = waitTab(tab.id);
    const clicked = await inPage(tab.id, () => {
      const button = [...document.querySelectorAll("a,button")].find((node) => node.innerText.trim() === "View all available postings");
      if (button) button.click();
      return Boolean(button);
    });
    if (!clicked) throw new Error("Not signed in to myFuture (postings page not found)");
    await listLoaded;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", files: ["lib/jobs.js", "orbis-board.js"] });
    const formLoaded = waitTab(tab.id);
    const found = await inPage(tab.id, async (id) => {
      const rows = await __orbisBoard.listAll();
      if (!rows.some((row) => row.id === String(id))) return false;
      __orbisBoard.applyHere(String(id));
      return true;
    }, [app.postingId]);
    if (!found) { await chrome.tabs.remove(tab.id); throw new Error(`posting ${app.postingId} is no longer listed`); }
    await formLoaded;
    await inPage(tab.id, (packageName, title) => {
      const bar = document.createElement("div");
      bar.style.cssText = "position:sticky;top:0;z-index:2147483000;background:#ed1b2f;color:#fff;font:600 15px system-ui,sans-serif;padding:10px 16px";
      bar.textContent = packageName ? `myFuture Toolkit: choose the package "${packageName}" for ${title}, review, then submit.` : `myFuture Toolkit: ${title} — choose your documents, review, then submit.`;
      document.body.prepend(bar);
    }, [app.package || "", app.title || app.postingId]);
    return tab;
  }

  async function probeApply(tabId, board, postingId) {
    note(tabId, `Opening the application form for ${postingId} (inspect only)…`);
    const formTab = await openFormTab({ postingId, board });
    const snapshot = await inPage(formTab.id, PROBE);
    const saved = await host({ cmd: "writeResult", name: `probe-${postingId}`, data: { postingId, snapshot } });
    note(tabId, `Application form saved to ${saved.path} (nothing submitted)`);
    return { path: saved.path, formTabId: formTab.id };
  }

  // Batch: one application form per ready posting, each in its own tab, one after another.
  async function openForms(tabId, postingIds) {
    const store = await loadApps();
    const targets = (postingIds?.length ? postingIds : Object.keys(store)).map(String)
      .map((id) => store[id]).filter((app) => app && !app.applied && app.packageStatus === "done");
    if (!targets.length) throw new Error("No prepared application is waiting (run Prepare first).");
    const opened = [], failed = [];
    for (const [index, app] of targets.entries()) {
      note(tabId, `Opening application form ${index + 1}/${targets.length}: ${app.organization} — ${app.title}`);
      try {
        const tab = await openFormTab(app, { active: index === 0 });
        opened.push(app.postingId);
        await updateApps((s) => { s[app.postingId].formOpenedAt = new Date().toISOString(); s[app.postingId].formTabId = tab.id; });
      } catch (error) {
        failed.push({ postingId: app.postingId, error: error.message || String(error) });
        await updateApps((s) => { s[app.postingId].error = error.message || String(error); });
      }
    }
    const message = `Opened ${opened.length} application form(s)${failed.length ? `, ${failed.length} failed` : ""}. In each tab, pick the named package and submit; then press Refresh status.`;
    note(tabId, message);
    return { message, opened, failed };
  }

  // Reads "Application Submitted" from each board's list and marks those applications as applied.
  async function refreshStatus(tabId) {
    const store = await loadApps();
    const boards = [...new Set(Object.values(store).map((app) => app.board || "internshipscoop"))];
    if (!boards.length) return { message: "No applications tracked yet." };
    await ensureFrameOps(tabId);
    const engine = [await ownFile("lib/jobs.js"), await ownFile("orbis-board.js")];
    let applied = 0;
    for (const board of boards) {
      note(tabId, `Checking ${board} for submitted applications…`);
      const rows = await inPage(tabId, async (path, sources) => {
        await window.__mfFrame.openBoard(path);
        const w = window.__mfFrame.frameWindow();
        for (const src of sources) w.eval(src);
        return (await w.__orbisBoard.listAll()).map((row) => ({ id: row.id, appStatus: row.appStatus, shortlisted: row.shortlisted }));
      }, [BOARDS[board], engine]);
      await updateApps((s) => {
        for (const app of Object.values(s)) {
          if ((app.board || "internshipscoop") !== board) continue;
          const row = rows.find((r) => r.id === app.postingId);
          if (!row) { app.listed = false; continue; }
          app.listed = true;
          app.appStatus = row.appStatus || "";
          app.applied = /submitted|soumise/i.test(row.appStatus || "");
          if (app.applied) applied += 1;
        }
      });
    }
    note(tabId, "Checking your cover letters and packages…");
    const [letterDocs, packageDocs] = await inPage(tabId, async () => [
      await window.__mfFrame.listDocs("Cover Letter"), await window.__mfFrame.listDocs("Application Packages")]);
    let ready = 0;
    await updateApps((s) => {
      for (const app of Object.values(s)) {
        if (app.letterName && letterDocs.some((d) => d.name === app.letterName)) app.letter = "done";
        if (app.package && packageDocs.some((d) => d.name === app.package)) { app.packageStatus = "done"; delete app.error; }
        if (app.packageStatus === "done" && !app.applied) ready += 1;
      }
    });
    const message = `${applied} application(s) submitted, ${ready} ready to apply.`;
    note(tabId, message);
    return { message };
  }

  async function status() {
    try {
      const ping = await host({ cmd: "ping" });
      const { plan } = await host({ cmd: "getPlan" });
      await seedApps(plan);
      return { ok: true, home: ping.home, plan, apps: await loadApps() };
    } catch (error) {
      return { ok: false, error: error.message || String(error), apps: await loadApps() };
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const jobs = {
      BRIDGE_STATUS: () => status(),
      BRIDGE_SCAN: () => scanBoard(message.tabId, message.board, message.prefs),
      BRIDGE_CHECK_PLAN: () => runPlan(message.tabId, { dryRun: true }),
      BRIDGE_RUN_PLAN: () => runPlan(message.tabId),
      BRIDGE_PROBE: () => probeApply(message.tabId, message.board, message.postingId),
      BRIDGE_OPEN_FORMS: () => openForms(message.tabId, message.postingIds),
      BRIDGE_REFRESH: () => refreshStatus(message.tabId),
      BRIDGE_FORGET: () => updateApps((s) => { delete s[String(message.postingId)]; }).then(() => ({}))
    };
    const job = jobs[message?.type];
    if (!job) return undefined;
    job().then((result) => sendResponse({ ok: true, ...result }), (error) => {
      note(message.tabId, `Failed: ${error.message || error}`);
      sendResponse({ ok: false, error: error.message || String(error) });
    });
    return true;
  });
})();
