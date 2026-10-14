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
    note(tabId, `Saved ${result.postings.length} postings to ${saved.path}`);
    return { count: result.postings.length, path: saved.path };
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

    const letters = apps.filter((app) => app.letterPdf && app.letterName && !app.letterUploaded);
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
      log.steps.push({ step: "upload", result: upload });
      if (!dryRun && !upload?.ok) return finish(tabId, log, "Cover letter upload failed — no packages were created.");
    }

    const packages = apps.filter((app) => app.package && app.createPackage !== false)
      // In a dry run the new letters are not on myFuture yet, so packages are checked without them.
      .map((app) => ({ name: app.package, cv: app.cv, transcript: app.transcript || null, coverLetter: dryRun && letters.includes(app) ? null : app.letterName || null }));
    if (packages.length) {
      note(tabId, `${dryRun ? "Checking" : "Creating"} ${packages.length} application package(s)…`);
      const existing = await inPage(tabId, () => window.__mfFrame.listDocs("Application Packages"));
      const clash = packages.filter((p) => existing.some((d) => d.name === p.name)).map((p) => p.name);
      if (clash.length && !dryRun) return finish(tabId, { ...log, steps: [...log.steps, { step: "packages", result: { ok: false, alreadyExist: clash } }] }, `Packages already exist: ${clash.join(", ")}`);
      const created = await inPage(tabId, (src, list, dry) => window.__mfFrame.packages(src, list, dry), [await script("packages.js"), packages, dryRun]);
      log.steps.push({ step: "packages", result: { ...created, alreadyExist: clash } });
    }

    if (!dryRun && plan.probeApply) {
      const target = apps.find((app) => String(app.postingId) === String(plan.probeApply)) || apps[0];
      log.steps.push({ step: "probe", result: await probeApply(tabId, target.board || "internshipscoop", target.postingId) });
    }
    return finish(tabId, log, dryRun ? "Check finished — nothing was saved." : "Done.");
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

  async function probeApply(tabId, board, postingId) {
    note(tabId, `Opening the application form for ${postingId} (inspect only)…`);
    await ensureFrameOps(tabId);
    const engine = [await ownFile("lib/jobs.js"), await ownFile("orbis-board.js")];
    const created = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { chrome.tabs.onCreated.removeListener(listener); reject(new Error("application form did not open")); }, 30000);
      function listener(tab) { if (tab.openerTabId === tabId) { clearTimeout(timer); chrome.tabs.onCreated.removeListener(listener); resolve(tab); } }
      chrome.tabs.onCreated.addListener(listener);
    });
    await inPage(tabId, async (path, sources, id) => {
      await window.__mfFrame.openBoard(path);
      const w = window.__mfFrame.frameWindow();
      for (const src of sources) w.eval(src);
      await w.__orbisBoard.listAll();
      w.__orbisBoard.apply(String(id));
    }, [BOARDS[board], engine, postingId]);
    const formTab = await created;
    await new Promise((resolve) => {
      const done = (id, info) => { if (id === formTab.id && info.status === "complete") { chrome.tabs.onUpdated.removeListener(done); resolve(); } };
      chrome.tabs.onUpdated.addListener(done);
      setTimeout(resolve, 20000);
    });
    const snapshot = await inPage(formTab.id, PROBE);
    const saved = await host({ cmd: "writeResult", name: `probe-${postingId}`, data: { postingId, snapshot } });
    note(tabId, `Application form saved to ${saved.path} (nothing submitted)`);
    return { path: saved.path, formTabId: formTab.id };
  }

  async function status() {
    try {
      const ping = await host({ cmd: "ping" });
      const { plan } = await host({ cmd: "getPlan" });
      return { ok: true, home: ping.home, plan };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const jobs = {
      BRIDGE_STATUS: () => status(),
      BRIDGE_SCAN: () => scanBoard(message.tabId, message.board, message.prefs),
      BRIDGE_CHECK_PLAN: () => runPlan(message.tabId, { dryRun: true }),
      BRIDGE_RUN_PLAN: () => runPlan(message.tabId),
      BRIDGE_PROBE: () => probeApply(message.tabId, message.board, message.postingId)
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
