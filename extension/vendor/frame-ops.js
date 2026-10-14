// McGill myFuture (Orbis) — drive myFuture pages in ONE hidden same-origin iframe so the visible page never navigates.
// Run INSIDE any myfuture.mcgill.ca page. Defines window.__mfFrame (same methods the bookmarklet panel uses):
//   listDocs(label)                 -> [{ name, date }]   label: 'CV/Resume' | 'Unofficial Transcript' | 'Cover Letter' | 'Application Packages'
//   upload(uploadSrc, docs, files, dryRun) -> upload.js result   (files: File objects)
//   packages(packagesSrc, packages, dryRun) -> packages.js result
//   packageOptions()                -> { '13': [...cover letters], '14': [...CVs], '15': [...transcripts] } names in the package form
//   openBoard(boardPath)            -> loads a postings board's "View all available postings" list in the frame
//   frameWindow()                   -> the iframe's window (to eval more scripts in it)
//   dispose()
// Sources of upload.js / packages.js are passed in, so this file has no other dependency.
(() => {
  if (window.__mfFrame) return;
  const ORIGIN = location.origin;
  const DOCS = ORIGIN + "/myAccount/opportunities/documents.htm";
  let frame = null;

  function ensureFrame() {
    if (!frame || !frame.isConnected) {
      frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;left:-99999px;top:0;width:1280px;height:900px;border:0";
      document.body.appendChild(frame);
    }
    return frame;
  }
  const win = () => ensureFrame().contentWindow;

  function frameLoad(trigger, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const f = ensureFrame();
      const timer = setTimeout(() => reject(new Error("myFuture took too long to answer")), timeoutMs);
      f.addEventListener("load", () => { clearTimeout(timer); resolve(f.contentDocument); }, { once: true });
      trigger(f);
    });
  }
  const goto = (url) => frameLoad((f) => { f.src = url; });
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const findButton = (doc, text) => [...doc.querySelectorAll("button,a")].find((x) => x.innerText.trim() === text && x.offsetParent);

  function pickOverviewRow(doc, label) {
    const re = new RegExp("^\\s*" + reEsc(label) + "\\s*\\d+");
    return [...doc.querySelectorAll("tr,li,div")].filter((e) => re.test(e.innerText || "") && e.querySelector("a,button"))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0];
  }
  function rowCount(row, label) {
    const m = (row.innerText || "").match(new RegExp(reEsc(label) + "\\s*(\\d+)"));
    return m ? Number(m[1]) : -1;
  }

  async function toAll() {
    let doc = await goto(DOCS);
    const sel = [...doc.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.text.trim() === "all"));
    if (!sel) throw new Error("Not signed in to myFuture (documents overview not found)");
    if (sel.value !== "0") doc = await frameLoad(() => { sel.value = "0"; sel.dispatchEvent(new (win().Event)("change", { bubbles: true })); });
    return doc;
  }

  async function listDocs(label) {
    let doc = await toAll();
    const row = pickOverviewRow(doc, label);
    if (!row || rowCount(row, label) === 0) return [];
    doc = await frameLoad(() => row.querySelector("a,button").click());
    let rows = [];
    for (let i = 0; i < 25 && !rows.length; i += 1) {
      rows = [...doc.querySelectorAll("table tbody tr")].filter((r) => r.querySelector("input[type=checkbox]"));
      if (!rows.length) await new Promise((r) => setTimeout(r, 400));
    }
    return rows.map((r) => [...r.querySelectorAll("td")].map((d) => d.innerText.trim())).map((c) => ({ name: c[2], date: c[4] }));
  }

  async function run(src, varName, cfg) {
    win()[varName] = cfg;
    const out = await Promise.resolve(win().eval(src));
    return typeof out === "string" ? JSON.parse(out) : out;
  }

  async function openForm(button, readySelector, error) {
    const doc = await goto(DOCS);
    const btn = findButton(doc, button);
    if (!btn) throw new Error("Not signed in to myFuture (" + button + " button not found)");
    await frameLoad(() => btn.click());
    if (!win().document.querySelector(readySelector)) throw new Error(error);
  }

  async function upload(uploadSrc, docs, files, dryRun) {
    await openForm("Upload Document", "input[name=docName]", "The upload form did not open");
    return run(uploadSrc, "__MF", { docs, files, dryRun: Boolean(dryRun) });
  }

  async function packages(packagesSrc, list, dryRun) {
    await openForm("Create Application Package", "input[name=name]", "The package form did not open");
    return run(packagesSrc, "__MFP", { packages: list, dryRun: Boolean(dryRun) });
  }

  async function packageOptions() {
    await openForm("Create Application Package", "input[name=name]", "The package form did not open");
    const d = win().document, out = {};
    for (const k of ["13", "14", "15"]) {
      const s = d.querySelector('select[name="' + k + '"]');
      out[k] = s ? [...s.options].filter((o) => o.value).map((o) => o.text.trim()) : [];
    }
    return out;
  }

  async function openBoard(boardPath) {
    const doc = await goto(ORIGIN + boardPath);
    const btn = findButton(doc, "View all available postings");
    if (!btn) throw new Error("Not signed in to myFuture (postings page not found)");
    await frameLoad(() => btn.click());
    for (let i = 0; i < 50 && typeof win().loadPostingTable !== "function"; i += 1) await new Promise((r) => setTimeout(r, 200));
    if (typeof win().loadPostingTable !== "function") throw new Error("The postings list did not load");
  }

  window.__mfFrame = {
    listDocs, upload, packages, packageOptions, openBoard,
    frameWindow: win,
    dispose() { if (frame) frame.remove(); frame = null; }
  };
})();
