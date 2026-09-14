// McGill myFuture (Orbis) — delete documents from a rendered documents LIST page
// (overview -> filter "all" -> View on "CV/Resume" / "Unofficial Transcript" / "Application Packages" / ...).
// window.__MFD = { type: 'CV/Resume' | 'Unofficial Transcript' | 'Package' | 'Cover Letter' | 'Other',
//                  keep?: ['names never deleted'], deleteMatch?: 'regex source', deleteNames?: ['exact names to delete'],
//                  requireKept?: true (abort unless every keep name is in the list),
//                  requireDeletable?: true (abort unless every deleteNames entry is in the list), expectKeep?: 6, dryRun?: true }
// A row is deleted when it is NOT in keep AND (deleteNames given ? its name is in deleteNames : (no deleteMatch OR its name matches deleteMatch)).
// Run right after the list rendered and do NOT GET documents.htm before the POSTs: the server silently ignores
// deletes sent after another page load. Verify afterwards from the overview counts.
// Returns a JSON string, never token values.
(async () => {
  const cfg = window.__MFD || {};
  if (!cfg.type) throw new Error('window.__MFD.type is required');
  const keep = new Set(cfg.keep || []);
  const match = cfg.deleteMatch ? new RegExp(cfg.deleteMatch) : null;
  const only = cfg.deleteNames ? new Set(cfg.deleteNames) : null;

  let rows = [];
  for (let i = 0; i < 20 && !rows.length; i++) {
    rows = [...document.querySelectorAll('table tbody tr')].filter(t => t.querySelector('input[type=checkbox]'));
    if (!rows.length) await new Promise(r => setTimeout(r, 500));
  }
  if (!rows.length) {
    if (/No Records Found/i.test(document.body.innerText)) return JSON.stringify({ type: cfg.type, kept: [], results: [] });
    throw new Error('document list not rendered');
  }

  // Capture each row's delete form: auto-confirm the dialog and intercept buildForm(...).submit().
  const oA = window.orbisApp;
  const oConfirm = oA.confirmDialog, oBuild = oA.buildForm;
  const items = rows.map(t => {
    const c = [...t.querySelectorAll('td')].map(d => d.innerText.trim());
    const name = c[2], type = c[3];
    const del = [...t.querySelectorAll('a,button')].find(b => b.innerText.trim() === 'Delete');
    let form = null;
    if (del) {
      oA.confirmDialog = (m, cb) => cb();
      oA.buildForm = function () {
        const f = oBuild.apply(this, arguments);
        const el = f && f.jquery ? f[0] : f;
        return { submit: () => { form = el; } };
      };
      try { new Function(del.getAttribute('onclick')).call(del); } finally { oA.confirmDialog = oConfirm; oA.buildForm = oBuild; }
    }
    const doDelete = !keep.has(name) && (only ? only.has(name) : (!match || match.test(name)));
    return { name, type, form, doDelete };
  });
  const cleanup = () => items.forEach(i => i.form && document.contains(i.form) && i.form.remove());

  const wrong = items.filter(i => i.type !== cfg.type);
  if (wrong.length) { cleanup(); throw new Error('rows of another type on this page: ' + [...new Set(wrong.map(i => i.type))].join(', ')); }
  const kept = items.filter(i => !i.doDelete).map(i => i.name);
  if (cfg.requireKept) {
    const absent = [...keep].filter(n => !items.some(i => i.name === n));
    if (absent.length) { cleanup(); throw new Error('documents that must stay are not in this list: ' + JSON.stringify(absent)); }
  }
  if (cfg.requireDeletable && only) {
    const absent = [...only].filter(n => !items.some(i => i.name === n));
    if (absent.length) { cleanup(); throw new Error('documents meant for deletion are not in this list: ' + JSON.stringify(absent)); }
  }
  if (cfg.expectKeep != null && kept.length !== cfg.expectKeep) { cleanup(); throw new Error(`expected ${cfg.expectKeep} kept, got ${kept.length}: ${JSON.stringify(kept)}`); }
  const todo = items.filter(i => i.doDelete);
  if (todo.some(i => !(i.form instanceof HTMLFormElement))) { cleanup(); throw new Error('could not capture a delete form'); }
  if (cfg.dryRun) { cleanup(); return JSON.stringify({ dryRun: true, type: cfg.type, kept, toDelete: todo.map(i => i.name) }); }

  const results = [];
  for (const [k, i] of todo.entries()) {
    if (k) await new Promise(r => setTimeout(r, 300));  // gentle on the site's security service
    const r = await fetch(location.origin + '/myAccount/opportunities/documents.htm', { method: 'POST', body: new FormData(i.form), credentials: 'same-origin' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    d.querySelectorAll('script,style,noscript').forEach(x => x.remove());
    const t = d.body.textContent;
    results.push({ name: i.name, status: /used in an application and cannot be deleted/i.test(t) ? 'in-use (site refuses)' : r.ok ? 'requested' : 'http ' + r.status });
  }
  cleanup();
  return JSON.stringify({ type: cfg.type, kept, results });
})();
