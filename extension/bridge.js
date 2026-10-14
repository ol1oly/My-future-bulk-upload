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

  const BOARD_KEY = "mfBoard";   // postingId -> { title, organization, board, shortlisted, appStatus, deadlineText, city }
  const HIDDEN_KEY = "mstHidden"; // posting ids the student removed from "My postings"
  const REQUESTS_KEY = "mstRequests"; // postings the student asked Claude to prepare

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
    const { [HIDDEN_KEY]: hidden = [] } = await chrome.storage.local.get({ [HIDDEN_KEY]: [] });
    return updateApps((apps) => {
      for (const app of plan?.applications || []) {
        const id = String(app.postingId);
        if (hidden.includes(id)) continue;
        apps[id] = { letter: app.letterPdf ? "todo" : "none", packageStatus: "todo", applied: false, ...(apps[id] || {}),
          postingId: id, title: app.title || "", organization: app.organization || "", board: app.board || "internshipscoop",
          package: app.package, letterName: app.letterName || "", inPlan: true };
      }
    });
  }

  // tabId -> { postingId, title, organization, package } for tabs the extension opened to apply.
  async function applyTabs() { return (await chrome.storage.session.get({ applyTabs: {} })).applyTabs; }
  async function setApplyTab(tabId, context) {
    const tabs = await applyTabs();
    if (context) tabs[tabId] = context; else delete tabs[tabId];
    await chrome.storage.session.set({ applyTabs: tabs });
  }
  chrome.tabs.onCreated.addListener(async (tab) => {
    const tabs = await applyTabs();
    if (tab.openerTabId && tabs[tab.openerTabId]) await setApplyTab(tab.id, tabs[tab.openerTabId]);
  });
  chrome.tabs.onRemoved.addListener((tabId) => { setApplyTab(tabId, null); });

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
  const script = async (name) => {
    try { return await ownFile(`vendor/${name}`); } catch (error) { return (await host({ cmd: "readScript", name })).source; }
  };

  async function inPage(tabId, func, args = []) {
    const [entry] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
    return entry?.result;
  }

  // Loads frame-ops.js into the page (once) and returns nothing; later calls use window.__mfFrame.
  async function ensureFrameOps(tabId) {
    const source = await ownFile("vendor/frame-ops.js"); // bundled copy of scripts/frame-ops.js (works without the bridge)
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
    let saved = { path: "" };
    try { saved = await host({ cmd: "writeResult", name: `scan-${board}`, data: result }); } catch (error) { /* no bridge: keep it in the extension only */ }
    const compact = result.postings.map((p) => ({ postingId: p.postingId, board, title: p.fields.title, organization: p.fields.organization || "",
      deadline: p.deadline, deadlineText: p.row.deadlineText, method: p.apply.method, language: p.fields.jobLanguage || p.language, score: p.fit.score,
      matched: p.fit.hits, why: p.why, appStatus: p.row.appStatus || "", cv: p.cv, documents: p.documents,
      summary: String(p.fields.description || "").replace(/\s+/g, " ").slice(0, 600) }));
    await chrome.storage.local.set({ mfLastScan: compact });
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
    return finish(tabId, log, dryRun ? "Check finished. Nothing was saved." : (log.problem || "Done."));
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
    await setApplyTab(tab.id, { postingId: String(app.postingId), title: app.title || "", organization: app.organization || "", package: app.package || "" });
    const formLoaded = waitTab(tab.id);
    const found = await inPage(tab.id, async (id) => {
      const rows = await __orbisBoard.listAll();
      if (!rows.some((row) => row.id === String(id))) return false;
      __orbisBoard.applyHere(String(id));
      return true;
    }, [app.postingId]);
    if (!found) { await chrome.tabs.remove(tab.id); throw new Error(`posting ${app.postingId} is no longer listed`); }
    await setApplyTab(tab.id, { postingId: String(app.postingId), title: app.title || "", organization: app.organization || "", package: app.package || "" });
    await formLoaded; // apply-helper.js (content script) shows the banner and pre-selects the package on every page
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
  async function openForms(tabId, postingIds, items) {
    const store = await loadApps();
    const targets = items?.length ? items
      : (postingIds?.length ? postingIds : Object.keys(store)).map(String).map((id) => store[id]).filter((app) => app && !app.applied && app.packageStatus === "done");
    if (!targets.length) throw new Error("No prepared application is waiting (run Prepare first).");
    const opened = [], failed = [];
    for (const [index, app] of targets.entries()) {
      note(tabId, `Opening application form ${index + 1}/${targets.length}: ${app.organization}: ${app.title}`);
      try {
        const tab = await openFormTab(app, { active: index === 0 });
        opened.push(app.postingId);
        await updateApps((s) => { if (s[app.postingId]) { s[app.postingId].formOpenedAt = new Date().toISOString(); s[app.postingId].formTabId = tab.id; } });
      } catch (error) {
        failed.push({ postingId: app.postingId, error: error.message || String(error) });
        await updateApps((s) => { if (s[app.postingId]) s[app.postingId].error = error.message || String(error); });
      }
    }
    const message = failed.length && !opened.length ? `Could not open the form: ${failed[0].error}`
      : `Opened ${opened.length} application form(s)${failed.length ? `, ${failed.length} failed` : ""}. In each tab, choose your documents (or the named package) and submit; then press Sync.`;
    note(tabId, message);
    return { message, opened, failed };
  }

  const SUBMITTED = /submitted|soumise|envoy/i;

  async function loadBoardIntoFrame(tabId, board, engine) {
    return inPage(tabId, async (path, sources) => {
      await window.__mfFrame.openBoard(path);
      const w = window.__mfFrame.frameWindow();
      for (const src of sources) w.eval(src);
      return (await w.__orbisBoard.listAll()).map((row) => ({ id: row.id, title: row.title, organization: row.organization, city: row.city,
        deadlineText: row.deadlineText, appStatus: row.appStatus, shortlisted: row.shortlisted, canApply: row.canApply }));
    }, [BOARDS[board], engine]);
  }

  // Reads both boards (list only, a few seconds): shortlist, started / submitted applications; and which planned
  // letters and packages already exist on myFuture.
  async function syncMyFuture(tabId) {
    await ensureFrameOps(tabId);
    const engine = [await ownFile("lib/jobs.js"), await ownFile("orbis-board.js")];
    const snapshot = {}, counts = {};
    for (const board of Object.keys(BOARDS)) {
      note(tabId, `Reading ${board === "career" ? "General Jobs" : "Internship / Co-op"} postings…`);
      counts[board] = await inPage(tabId, (path) => window.__mfFrame.boardCounts(path), [BOARDS[board]]);
      for (const row of await loadBoardIntoFrame(tabId, board, engine)) snapshot[row.id] = { ...row, board };
    }
    // The myFuture shortlist is the source of truth: anything on it is shown again even if it was hidden earlier.
    const { [HIDDEN_KEY]: hiddenBefore = [] } = await chrome.storage.local.get({ [HIDDEN_KEY]: [] });
    const hidden = hiddenBefore.filter((id) => !snapshot[id]?.shortlisted);
    await chrome.storage.local.set({ [BOARD_KEY]: snapshot, mfCounts: counts, mfSyncedAt: new Date().toISOString(), [HIDDEN_KEY]: hidden });
    note(tabId, "Checking your cover letters and packages…");
    const [letterDocs, packageDocs] = await inPage(tabId, async () => [
      await window.__mfFrame.listDocs("Cover Letter"), await window.__mfFrame.listDocs("Application Packages")]);
    const [cvDocs, transcriptDocs] = await inPage(tabId, async () => [
      await window.__mfFrame.listDocs("CV/Resume"), await window.__mfFrame.listDocs("Unofficial Transcript")]);
    await chrome.storage.local.set({ mfDocs: { cvs: cvDocs.map((d) => d.name), transcripts: transcriptDocs.map((d) => d.name),
      coverLetters: letterDocs.map((d) => d.name), packages: packageDocs.map((d) => d.name) } });
    let submitted = 0, started = 0, ready = 0;
    await updateApps((s) => {
      for (const app of Object.values(s)) {
        const row = snapshot[app.postingId];
        app.listed = Boolean(row);
        app.appStatus = row?.appStatus || "";
        app.applied = SUBMITTED.test(app.appStatus);
        app.started = Boolean(app.appStatus) && !app.applied;
        if (app.letterName && letterDocs.some((d) => d.name === app.letterName)) app.letter = "done";
        if (app.package && packageDocs.some((d) => d.name === app.package)) { app.packageStatus = "done"; delete app.error; }
        if (app.applied) submitted += 1; else if (app.started) started += 1;
        if (app.packageStatus === "done" && !app.applied) ready += 1;
      }
    });
    const shortlisted = Object.values(snapshot).filter((r) => r.shortlisted).length;
    const totalShortlist = Object.values(counts).reduce((sum, c) => sum + (c?.shortlist || 0), 0);
    const closed = Math.max(0, totalShortlist - shortlisted);
    const message = `Synced: ${shortlisted} open shortlisted posting(s)${closed ? ` (${closed} more on your myFuture shortlist are closed)` : ""}, ${submitted} submitted, ${ready} ready to apply.`;
    note(tabId, message);
    return { message };
  }

  // One posting's row on its board (shortlisted? submitted?), read live in a hidden frame. Optionally toggles the shortlist.
  async function boardRow(tabId, postingId, board, toggle) {
    await ensureFrameOps(tabId);
    const engine = [await ownFile("lib/jobs.js"), await ownFile("orbis-board.js")];
    const row = await inPage(tabId, async (path, sources, id, flip) => {
      await window.__mfFrame.openBoard(path);
      const w = window.__mfFrame.frameWindow();
      for (const src of sources) w.eval(src);
      const found = (await w.__orbisBoard.listAll()).find((r) => r.id === String(id));
      if (!found) return null;
      if (flip) { await w.__orbisBoard.toggleShortlist(String(id)); found.shortlisted = !found.shortlisted; }
      return { id: found.id, title: found.title, organization: found.organization, city: found.city, deadlineText: found.deadlineText,
        appStatus: found.appStatus, shortlisted: found.shortlisted, canApply: found.canApply };
    }, [BOARDS[board || "internshipscoop"], engine, postingId, Boolean(toggle)]);
    if (!row) return null;
    // Update only this posting in the stored snapshot (no full sync).
    const { [BOARD_KEY]: snapshot = {} } = await chrome.storage.local.get({ [BOARD_KEY]: {} });
    snapshot[postingId] = { ...(snapshot[postingId] || {}), ...row, board: board || "internshipscoop" };
    await chrome.storage.local.set({ [BOARD_KEY]: snapshot });
    chrome.runtime.sendMessage({ type: "BRIDGE_APPS" }).catch(() => {});
    return row;
  }

  async function toggleShortlistJob(tabId, postingId, board) {
    const row = await boardRow(tabId, postingId, board, true);
    if (!row) throw new Error("This posting is no longer listed on myFuture.");
    return { message: row.shortlisted ? "Added to your myFuture shortlist." : "Removed from your myFuture shortlist.", shortlisted: row.shortlisted };
  }

  async function postingStatus(tabId, postingId, board) {
    const row = await boardRow(tabId, postingId, board, false);
    return row ? { found: true, shortlisted: row.shortlisted, appStatus: row.appStatus || "", submitted: SUBMITTED.test(row.appStatus || "") }
      : { found: false };
  }

  // Opens the posting itself (myFuture's view page) in a new tab.
  async function openPostingTab(item) {
    const tab = await chrome.tabs.create({ url: `https://myfuture.mcgill.ca${BOARDS[item.board || "internshipscoop"]}`, active: true });
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
    const ok = await inPage(tab.id, async (id) => {
      const rows = await __orbisBoard.listAll();
      if (!rows.some((row) => row.id === String(id))) return false;
      __orbisBoard.openHere(String(id));
      return true;
    }, [item.postingId]);
    if (!ok) throw new Error("This posting is no longer listed on myFuture.");
    return { message: "Opened the posting in a new tab." };
  }

  // Full posting text from myFuture (hidden frame), parsed, for writing a cover letter about it.
  async function postingDetails(tabId, item) {
    await ensureFrameOps(tabId);
    const engine = [await ownFile("lib/jobs.js"), await ownFile("orbis-board.js")];
    return inPage(tabId, async (path, sources, id) => {
      await window.__mfFrame.openBoard(path);
      const w = window.__mfFrame.frameWindow();
      for (const src of sources) w.eval(src);
      await w.__orbisBoard.listAll();
      const p = w.JobTools.parsePosting(await w.__orbisBoard.fetchDetail(String(id)));
      return JSON.parse(JSON.stringify({ title: p.fields.title || "", organization: p.fields.organization || "", description: p.fields.description || "",
        qualifications: p.fields.qualifications || "", template: p.coverLetter.template, salutation: p.coverLetter.slots.SALUTATION, cv: p.cv,
        language: p.language, track: p.track.track, matched: p.track.matched, documents: p.documents }));
    }, [BOARDS[item.board || "internshipscoop"], engine, item.postingId]);
  }

  // What this posting calls for: suggested CV (language × track, with the keywords that decided it) and documents.
  async function recommend(tabId, item) {
    const d = await postingDetails(tabId, item);
    return { cv: d.cv, language: d.language, track: d.track, matched: d.matched, documents: d.documents };
  }

  // Claude (on this computer, through the bridge, with no tools) writes the one posting-specific sentence.
  async function draftLetter(tabId, item, rewrite = {}) {
    note(tabId, "Reading the posting…");
    const details = await postingDetails(tabId, item);
    const posting = { ...details, postingId: String(item.postingId), title: details.title || item.title, organization: details.organization || item.organization,
      feedback: rewrite.feedback || "", previous: rewrite.previous || "" };
    note(tabId, "Claude is writing the sentence for this posting…");
    const draft = await host({ cmd: "draftLetter", posting });
    note(tabId, draft.issues?.length ? `Review the letter: ${draft.issues.join("; ")}.` : "Review the letter, then create the package.");
    return { text: draft.text, style: draft.style, issues: draft.issues || [], model: draft.model, cv: details.cv, documents: details.documents,
      posting: { ...posting, style: draft.style, description: undefined, qualifications: undefined, feedback: undefined, previous: undefined } };
  }

  // Make the PDFs only (no upload): one Word session per chunk of up to 6 letters.
  async function makeLetters(tabId, items) {
    const results = [];
    for (let i = 0; i < items.length; i += 6) {
      const chunk = items.slice(i, i + 6);
      note(tabId, `Making PDFs ${i + 1}-${i + chunk.length} of ${items.length} (Word starts once per group)…`);
      const reply = await host({ cmd: "fillLetters", items: chunk.map((it) => ({ posting: { ...it.posting, postingId: String(it.postingId) }, text: it.text })) });
      results.push(...reply.results);
    }
    const ok = results.filter((r) => r.ok).length;
    const message = `${ok} of ${items.length} PDF(s) made${ok < items.length ? "; see the ones marked in red" : ""}. View them, then upload.`;
    note(tabId, message);
    return { message, results };
  }

  async function viewPath(path) {
    const file = await host({ cmd: "readFile", path });
    return viewFile({ name: file.name, base64: file.base64 });
  }

  // Find matches: read the board, rank by keywords (everyone); with Claude Code + a profile, Claude picks the best of the
  // top 40 and says why. Suggestions appear in My postings.
  async function findMatches(tabId, board = "internshipscoop") {
    await scanBoard(tabId, board);
    const stored = (await chrome.storage.local.get({ mfLastScan: [] })).mfLastScan;
    const open = stored.filter((p) => !p.why && !/submitted|soumise/i.test(p.appStatus || "")).sort((a, b) => b.score - a.score);
    if (!open.length) return { message: "No open posting matches your Smart search filters." };
    let picks = [], by = "keywords";
    let letters = null;
    try { letters = (await host({ cmd: "ping" })).letters; } catch (error) { letters = null; }
    if (letters?.claude && letters.profile) {
      note(tabId, "Claude is picking the best matches for your profile…");
      try {
        picks = (await host({ cmd: "rankPostings", candidates: open.slice(0, 40) })).picks;
        by = "claude";
      } catch (error) {
        note(tabId, `Claude couldn't rank them (${error.message}); using keyword matches.`);
      }
    }
    if (!picks.length) picks = open.slice(0, 8).map((p) => ({ postingId: p.postingId, reason: p.matched?.length ? `Matches ${p.matched.slice(0, 5).join(", ")}` : "High keyword score" }));
    const suggested = {};
    for (const pick of picks) {
      const p = open.find((x) => x.postingId === pick.postingId);
      if (p) suggested[p.postingId] = { ...p, reason: pick.reason, by, suggestedAt: new Date().toISOString() };
    }
    const { [HIDDEN_KEY]: hidden = [] } = await chrome.storage.local.get({ [HIDDEN_KEY]: [] });
    await chrome.storage.local.set({ mstSuggested: suggested, [HIDDEN_KEY]: hidden.filter((id) => !suggested[id]) });
    chrome.runtime.sendMessage({ type: "BRIDGE_APPS" }).catch(() => {});
    const message = `${Object.keys(suggested).length} suggestion(s) ${by === "claude" ? "picked by Claude" : "by keyword match"}. See the Suggested filter.`;
    note(tabId, message);
    return { message };
  }

  // Letters: keep the PDF used in each package so the student can open it; show any PDF in the extension's viewer.
  async function keepLetter(postingId, file) {
    const { mstLetterFiles = {} } = await chrome.storage.local.get({ mstLetterFiles: {} });
    mstLetterFiles[postingId] = { name: file.name, base64: file.base64 };
    await chrome.storage.local.set({ mstLetterFiles });
  }
  async function viewFile(file) {
    if (!file?.base64) throw new Error("No letter to show.");
    await chrome.storage.session.set({ viewPdf: file });
    await chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    return { message: "Opened the letter in a new tab." };
  }
  async function viewLetter(postingId) {
    const { mstLetterFiles = {} } = await chrome.storage.local.get({ mstLetterFiles: {} });
    return viewFile(mstLetterFiles[postingId]);
  }

  // Prepare one application from the popup, no Claude needed: optional cover letter (existing name or a PDF the
  // student picked), then one package "<cv base>_<Org>_<date>". Records it under My postings as ready to apply.
  async function prepareOne(tabId, item, choice) {
    await ensureFrameOps(tabId);
    const day = new Date().toISOString().slice(0, 10);
    const org = String(item.organization || "Job").replace(/[^A-Za-z0-9]+/g, "").slice(0, 24) || "Job";
    const base = String(choice.cv).replace(DATED, "");
    let packageName = `${base}_${org}_${day}`;
    const docs = await inPage(tabId, async () => [await window.__mfFrame.listDocs("Application Packages"), await window.__mfFrame.listDocs("Cover Letter")]);
    for (let n = 2; docs[0].some((d) => d.name === packageName); n += 1) packageName = `${base}_${org}${n}_${day}`;
    let letterName = choice.coverLetter || "";
    if (choice.claude?.pdf || choice.claude?.text) {
      let pdf = choice.claude.pdf; // already made and viewed: upload exactly that file
      if (!pdf) {
        note(tabId, "Making the cover letter PDF (Word, up to a minute)…");
        pdf = (await host({ cmd: "fillLetter", posting: { ...choice.claude.posting, postingId: String(item.postingId) }, text: choice.claude.text })).pdf;
      }
      const file = await host({ cmd: "readFile", path: pdf });
      choice.letterFile = { name: file.name, base64: file.base64 };
    }
    if (choice.letterFile) {
      letterName = `cl_${org}_${day}`;
      for (let n = 2; docs[1].some((d) => d.name === letterName); n += 1) letterName = `cl_${org}${n}_${day}`;
      note(tabId, "Uploading your cover letter…");
      const upload = await inPage(tabId, async (src, doc, file) => {
        const binary = atob(file.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return window.__mfFrame.upload(src, [doc], [new File([bytes], file.name, { type: "application/pdf" })], false);
      }, [await script("upload.js"), { file: choice.letterFile.name, name: letterName, type: "13" }, choice.letterFile]);
      if (!upload?.ok) throw new Error("The cover letter could not be uploaded.");
    }
    if (choice.letterFile) await keepLetter(String(item.postingId), choice.letterFile);
    note(tabId, `Creating package ${packageName}…`);
    const created = await inPage(tabId, (src, list) => window.__mfFrame.packages(src, list, false),
      [await script("packages.js"), [{ name: packageName, cv: choice.cv, transcript: choice.transcript || null, coverLetter: letterName || null }]]);
    if (!created?.ok) throw new Error(`The package could not be created (${created?.results?.[0]?.status || "unknown error"}).`);
    await updateApps((s) => {
      const id = String(item.postingId);
      s[id] = { ...(s[id] || {}), postingId: id, title: item.title || "", organization: item.organization || "", board: item.board || "internshipscoop",
        package: packageName, packageStatus: "done", letterName, letter: letterName ? "done" : "none", cvUsed: choice.cv, transcriptUsed: choice.transcript || "",
        applied: false, inPlan: true, source: "extension" };
    });
    const message = `Package ${packageName} is ready. Press Apply to open the form.`;
    note(tabId, message);
    return { message, packageName };
  }

  // "Ask Claude to prepare": remembered in the extension and written to ~/.mst/out/requests.json for Claude.
  async function requestPrep(item) {
    const { [REQUESTS_KEY]: requests = [] } = await chrome.storage.local.get({ [REQUESTS_KEY]: [] });
    if (!requests.some((r) => r.postingId === item.postingId)) requests.push({ ...item, requestedAt: new Date().toISOString() });
    await chrome.storage.local.set({ [REQUESTS_KEY]: requests });
    try {
      await host({ cmd: "writeResult", name: "requests", data: requests });
      return { message: `Saved. Ask Claude: “prepare my requested applications” (${requests.length} waiting).` };
    } catch (error) {
      return { message: "Saved in the extension, but the local bridge isn't installed, so Claude can't see it yet." };
    }
  }

  async function forget(postingId) {
    const { [HIDDEN_KEY]: hidden = [], jobTracker = {} } = await chrome.storage.local.get({ [HIDDEN_KEY]: [], jobTracker: {} });
    if (!hidden.includes(postingId)) hidden.push(postingId);
    delete jobTracker[`p${postingId}`];
    await chrome.storage.local.set({ [HIDDEN_KEY]: hidden, jobTracker });
    await updateApps((s) => { delete s[postingId]; });
    const { mstSuggested = {} } = await chrome.storage.local.get({ mstSuggested: {} });
    delete mstSuggested[postingId];
    await chrome.storage.local.set({ mstSuggested });
    return { message: "Hidden from My postings." };
  }

  async function unhideAll() {
    const { [HIDDEN_KEY]: hidden = [] } = await chrome.storage.local.get({ [HIDDEN_KEY]: [] });
    await chrome.storage.local.set({ [HIDDEN_KEY]: [] });
    chrome.runtime.sendMessage({ type: "BRIDGE_APPS" }).catch(() => {});
    return { message: `${hidden.length} hidden posting(s) shown again. Press Sync to refresh them.` };
  }

  async function status() {
    try {
      const ping = await host({ cmd: "ping" });
      const { plan } = await host({ cmd: "getPlan" });
      await seedApps(plan);
      return { ok: true, home: ping.home, plan, letters: ping.letters, apps: await loadApps() };
    } catch (error) {
      return { ok: false, error: error.message || String(error), apps: await loadApps() };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const _sender = sender;
    if (message?.type === "APPLY_CONTEXT") {
      applyTabs().then((tabs) => sendResponse(sender.tab ? tabs[sender.tab.id] || null : null));
      return true;
    }
    const jobs = {
      BRIDGE_STATUS: () => status(),
      BRIDGE_SCAN: () => scanBoard(message.tabId, message.board, message.prefs),
      BRIDGE_CHECK_PLAN: () => runPlan(message.tabId, { dryRun: true }),
      BRIDGE_RUN_PLAN: () => runPlan(message.tabId),
      BRIDGE_PROBE: () => probeApply(message.tabId, message.board, message.postingId),
      BRIDGE_OPEN_FORMS: () => openForms(message.tabId, message.postingIds, message.items),
      BRIDGE_REFRESH: () => syncMyFuture(message.tabId),
      BRIDGE_SYNC: () => syncMyFuture(message.tabId),
      BRIDGE_SHORTLIST: () => toggleShortlistJob(message.tabId, String(message.postingId), message.board),
      BRIDGE_POSTING_STATUS: () => postingStatus(message.tabId, String(message.postingId), message.board),
      BRIDGE_OPEN_POSTING: () => openPostingTab(message.item),
      BRIDGE_REQUEST_PREP: () => requestPrep(message.item),
      BRIDGE_FORGET: () => forget(String(message.postingId)),
      BRIDGE_UNHIDE: () => unhideAll(),
      APPLY_DONE: () => setApplyTab(_sender?.tab?.id ?? message.tabId, null).then(() => ({})),
      BRIDGE_PREPARE_ONE: () => prepareOne(message.tabId, message.item, message.choice),
      BRIDGE_DRAFT_LETTER: () => draftLetter(message.tabId, message.item, { feedback: message.feedback, previous: message.previous }),
      BRIDGE_MAKE_LETTERS: () => makeLetters(message.tabId, message.items),
      BRIDGE_VIEW_PATH: () => viewPath(message.path),
      BRIDGE_RECOMMEND: () => recommend(message.tabId, message.item),
      BRIDGE_FIND_MATCHES: () => findMatches(message.tabId, message.board),
      BRIDGE_PREVIEW_LETTER: () => host({ cmd: "previewLetter", posting: message.posting, text: message.text }),
      BRIDGE_VIEW_LETTER: () => viewLetter(String(message.postingId)),
      BRIDGE_VIEW_FILE: () => viewFile(message.file)
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
