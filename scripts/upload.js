// McGill myFuture (Orbis) — bulk document upload. Run INSIDE the "Upload a Document" form page.
// window.__MF = { docs: [{ file: 'en_cv.pdf', name: 'en_cv_2026-09-14', type: '14' }], dryRun?: true }
//   type: '13' Cover Letter, '14' CV/Resume, '15' Unofficial Transcript, '16' Other
// The files must be in <input type=file multiple id="__bulk">. Returns a JSON string, never token values.
(async () => {
  const cfg = window.__MF || {};
  const DOCS = (cfg.docs || []).map(d => ({ ...d, type: String(d.type) }));
  if (!DOCS.length) throw new Error('window.__MF.docs is empty');
  const LABEL = { 13: /Cover Letter\s*(\d+)/, 14: /CV\/Resume\s*(\d+)/, 15: /Unofficial Transcript\s*(\d+)/, 16: /\bOther\s*(\d+)/ };
  const URL_DOCS = location.origin + '/myAccount/opportunities/documents.htm';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const t0 = performance.now();

  const main = document.querySelector('input[name=docName]')?.closest('form');
  if (!main) throw new Error('not on the "Upload a Document" form');
  // Files come from window.__MF.files (File objects, e.g. the bookmarklet panel) or the injected #__bulk input.
  const files = Object.fromEntries([...(cfg.files || document.getElementById('__bulk')?.files || [])].map(f => [f.name, f]));
  const missing = DOCS.filter(d => !files[d.file]).map(d => d.file);
  if (missing.length) throw new Error('missing in #__bulk: ' + missing.join(', '));
  const bad = DOCS.filter(d => !LABEL[d.type] || !d.name);
  if (bad.length) throw new Error('bad doc entries: ' + JSON.stringify(bad));

  // Clean fetch/XHR from a fresh iframe, in case the page's own ones were patched.
  const ifr = document.createElement('iframe');
  ifr.style.display = 'none';
  document.body.appendChild(ifr);
  const cw = ifr.contentWindow;
  const rfetch = cw.fetch.bind(cw);
  const text = async resp => {
    const d = new DOMParser().parseFromString(await resp.text(), 'text/html');
    d.querySelectorAll('script,style,noscript').forEach(x => x.remove());
    return d.body.textContent;
  };

  // 1. Capture the upload request params (action, uploadDirectory) and headers (X-CSRF-TOKEN, ...)
  //    by feeding one file to the site's own file input.
  const proto = XMLHttpRequest.prototype;
  const pageSend = proto.send, pageSRH = proto.setRequestHeader;
  const cleanSend = cw.XMLHttpRequest.prototype.send, cleanSRH = cw.XMLHttpRequest.prototype.setRequestHeader;
  let upVals = null, upHeaders = {};
  proto.setRequestHeader = function (k, v) { (this.__h = this.__h || {})[k] = v; return cleanSRH.call(this, k, v); };
  proto.send = function (b) {
    if (b instanceof FormData && [...b.keys()].includes('upload')) {
      upVals = Object.fromEntries([...b.entries()].filter(([, v]) => !(v instanceof File)));
      upHeaders = this.__h || {};
    }
    return cleanSend.call(this, b);
  };
  const siteInput = [...document.querySelectorAll('input[type=file]')].find(i => i.id !== '__bulk');
  const dt = new DataTransfer();
  dt.items.add(files[DOCS[0].file]);
  siteInput.files = dt.files;
  siteInput.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 40 && !upVals; i++) await sleep(250);
  proto.send = pageSend;
  proto.setRequestHeader = pageSRH;
  if (!upVals) throw new Error('could not capture upload params (site uploader did not fire)');
  const headers = Object.fromEntries(Object.entries(upHeaders).filter(([k]) => !/content-type/i.test(k)));
  headers['X-Requested-With'] = 'XMLHttpRequest';

  const counts = async () => {
    const t = await text(await rfetch(URL_DOCS, { credentials: 'include' }));
    return Object.fromEntries(Object.entries(LABEL).map(([k, re]) => [k, Number((t.match(re) || [])[1] ?? NaN)]));
  };
  const before = await counts();

  // 2. Upload every file to temp storage in parallel -> one uuid per file (nothing saved yet).
  const uploadOne = async fname => {
    for (let a = 1; a <= 3; a++) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(upVals)) fd.append(k, v);
      fd.append('upload', files[fname], fname);
      try {
        const r = await rfetch(URL_DOCS, { method: 'POST', body: fd, credentials: 'include', headers });
        const j = await r.json();
        if (j?.success && j.uuid) return j.uuid;
      } catch (e) { /* retry */ }
      await sleep(800 * a);
    }
    return null;
  };
  // Limited concurrency + a small stagger: a burst of identical POSTs trips the site's security service.
  const CONC = Math.max(1, cfg.concurrency || 3);
  const uuids = new Array(DOCS.length);
  let next = 0;
  const worker = async () => {
    while (next < DOCS.length) {
      const i = next++;
      await sleep(150 * (i % CONC));
      uuids[i] = await uploadOne(DOCS[i].file);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, DOCS.length) }, worker));
  const upFailed = DOCS.filter((_, i) => !uuids[i]).map(d => d.file);
  if (upFailed.length) throw new Error('temp upload failed: ' + upFailed.join(', '));
  const tempMs = Math.round(performance.now() - t0);
  if (cfg.dryRun) return JSON.stringify({ dryRun: true, before, tempUploaded: uuids.length, tempMs });

  // 3. Save one by one: POST the form with docUploaded=uuid.
  //    Overview returned ("Documents Created In") => saved. Form returned ("Upload a Document") => not saved, safe to retry.
  const results = [];
  for (let i = 0; i < DOCS.length; i++) {
    const d = DOCS[i];
    let status = 'failed';
    for (let a = 1; a <= 3 && status !== 'saved'; a++) {
      const fd = new FormData(main);
      fd.set('docName', d.name);
      fd.set('docType', d.type);
      fd.set('docUploaded', uuids[i]);
      const t = await text(await rfetch(URL_DOCS, { method: 'POST', body: fd, credentials: 'include' }));
      if (/Documents Created In|My Global Documents/.test(t) && !/Upload a Document/.test(t)) status = 'saved';
      else if (/Upload a Document/.test(t)) { status = 'form-returned'; await sleep(1500); }
      else { status = 'unexpected-page'; break; }
    }
    results.push({ name: d.name, status });
    if (status !== 'saved') break;
  }

  // 4. Verify with the server's counts ("last 30 days" numbers — compare deltas only).
  const after = await counts();
  const used = [...new Set(DOCS.map(d => d.type))];
  const expect = Object.fromEntries(used.map(t => [t, before[t] + DOCS.filter(d => d.type === t).length]));
  const only = o => Object.fromEntries(used.map(t => [t, o[t]]));
  const ok = results.length === DOCS.length && results.every(r => r.status === 'saved') && used.every(t => after[t] === expect[t]);
  return JSON.stringify({ ok, before: only(before), after: only(after), expect, results, tempMs, totalMs: Math.round(performance.now() - t0) });
})();
